// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test, console} from "forge-std/Test.sol";
import {PonsFundTreasury} from "../src/PonsFundTreasury.sol";
import {PonsFundLaunchpad} from "../src/PonsFundLaunchpad.sol";
import {IPonsV2Factory, IPonsV2LaunchAndBuy, IPonsFeeEscrow} from "../src/interfaces/IPonsV2.sol";

/**
 * The per-launch bonding curve, for the two calls a trade needs.
 *
 * ⛔ `sweepFees(uint256)`, never `sweepFees()`. The argument is the slippage floor for the buyback
 * leg; a no-arg version compiles fine, is a different selector, and reverts with no data -- which is
 * indistinguishable from a permission failure and costs an hour to tell apart.
 */
interface ICurve {
    function buy(uint256 quoteIn, uint256 minTokensOut, address recipient) external payable returns (uint256);
    function sell(uint256 tokensIn, uint256 minQuoteOut, address recipient) external returns (uint256);
}

interface IERC20Bal {
    function balanceOf(address) external view returns (uint256);
    function approve(address, uint256) external returns (bool);
}

/**
 * The whole money path, on a fork of live Robinhood Chain: launch, trade, sweep, harvest, and the
 * fee landing in the destination wallet.
 *
 * ## ⛔⛔ WHY THIS IS SEPARATE FROM THE UNIT TESTS
 *
 * `PonsFundTreasury.t.sol` proves the treasury forwards what it is given, against a mock escrow
 * written by the same hand. It cannot prove anything about Pons. This proves that a **real** trade
 * on a **real** Pons curve produces fees that a **real** escrow hands over, and that our treasury
 * is allowed to move them.
 *
 * Every step between "somebody buys the token" and "the wallet balance rises" is somebody else's
 * contract. The only way to know they connect is to make them connect.
 *
 * ⚠ Skips when `scripts/rpc-proxy.mjs` is not running. See `Fork.t.sol`.
 */
contract FeeFlowTest is Test {
    IPonsV2Factory constant FACTORY = IPonsV2Factory(0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e);
    IPonsV2LaunchAndBuy constant ROUTER = IPonsV2LaunchAndBuy(0xe33E9E479dF8802cb0866d5d05258bEc4cF62948);

    /// Native ETH on Pons. NOT in `approvedPairTokens` -- see the note on `PonsFundLaunchpad.launch`.
    address constant NATIVE = address(0);

    address constant LAUNCHER = 0x00000000000000000000000000000000CaFe0003;
    address constant TRADER = 0x00000000000000000000000000000000caFe0004;
    /// The wallet the whole design points at. A stand-in address is used so the test owns the balance.
    address constant DESTINATION = 0x00000000000000000000000000000000Cafe0007;

    bool forked;
    PonsFundTreasury treasury;
    PonsFundLaunchpad launchpad;

    function setUp() public {
        try vm.createSelectFork(vm.envOr("RHC_RPC", string("http://127.0.0.1:8899"))) {
            forked = address(FACTORY).code.length > 0;
        } catch {
            forked = false;
            return;
        }
        if (!forked) return;
        treasury = new PonsFundTreasury(DESTINATION, IPonsFeeEscrow(FACTORY.feeEscrow()));
        launchpad = new PonsFundLaunchpad(FACTORY, ROUTER, address(treasury));
    }

    function test_aRealTradeProducesFeesThatReachTheWallet() public {
        if (!forked) {
            console.log("SKIP: no fork. Start `node scripts/rpc-proxy.mjs` and re-run.");
            return;
        }
        if (!FACTORY.launchEnabled()) {
            console.log("SKIP: Pons has launches disabled right now.");
            return;
        }

        /* ── launch ──────────────────────────────────────────────────────────────────────────── */
        IPonsV2Factory.LaunchParams memory p;
        p.name = "Fee Flow";
        p.symbol = "FLOW";
        p.socials = IPonsV2Factory.Socials("", "", "", "", "");
        p.salt = keccak256("ponsfund-fee-flow-1");

        uint256 fee = FACTORY.launchFee();
        vm.deal(LAUNCHER, fee + 1 ether);
        vm.prank(LAUNCHER);
        (address token, address curve) = launchpad.launch{value: fee}(p, 0, NATIVE, 0, 0);

        IPonsV2Factory.LaunchedToken memory rec = FACTORY.getLaunchedToken(token);
        assertEq(rec.creatorFeeRecipient, address(treasury), "the launch must pay the treasury");

        /* ── somebody buys ───────────────────────────────────────────────────────────────────── */
        vm.deal(TRADER, 20 ether);
        vm.prank(TRADER);
        ICurve(curve).buy{value: 10 ether}(10 ether, 0, TRADER);
        uint256 bought = IERC20Bal(token).balanceOf(TRADER);
        assertGt(bought, 0, "the buy produced no tokens");

        /* ── and sells, because the fee is charged on both legs ──────────────────────────────── */
        vm.startPrank(TRADER);
        IERC20Bal(token).approve(curve, bought);
        ICurve(curve).sell(bought / 2, 0, TRADER);
        vm.stopPrank();

        /*
          ⚠⚠ THE SWEEP IS A SEPARATE STEP AND IT IS NOT OURS. Fees accrue on the curve and reach the
          escrow only when somebody sweeps. A test that harvested without sweeping would read zero
          and look like a broken treasury, when the money simply had not moved yet.

          ⭐⭐ Swept THROUGH the treasury by a stranger. This is the single assertion that justifies
          the treasury existing at all: `sweepFees` reverts `NotFeeSweepOperator()` for everyone but
          Pons's operator and the launch's fee recipient, so had the destination wallet been named
          directly, this line could only ever be sent by the holder of its private key.
        */
        vm.prank(address(0xBEEF));
        treasury.sweepCurve(curve, 0);

        uint256 claimable = IPonsFeeEscrow(FACTORY.feeEscrow()).balanceOf(address(treasury));
        console.log("swept into the escrow for this launch (wei):", claimable);
        assertGt(claimable, 0, "trading produced no claimable fees");

        /*
          ⚠⚠ DO NOT READ THAT NUMBER AS TYPICAL REVENUE. It comes out around 6.9 ETH on a 10 ETH buy,
          which is not a 1% trading fee -- it is the SNIPE TAX, and this test collects it at its
          maximum because it buys in the same block the launch was created in. Pons decays that tax
          over the first seconds of a launch.
          A trade at a normal point in a token's life pays roughly 1%, so a figure from this test
          must never be quoted anywhere as what a launch earns.
        */

        /* ── harvest, also by a stranger ─────────────────────────────────────────────────────── */
        uint256 before = DESTINATION.balance;
        vm.prank(address(0xDEAD));
        treasury.harvest();

        uint256 delivered = DESTINATION.balance - before;
        console.log("delivered to the wallet (wei)             :", delivered);

        assertEq(delivered, claimable, "the wallet receives the whole claim, not a share of it");
        assertEq(address(treasury).balance, 0, "nothing waits in the treasury");
        assertEq(treasury.totalForwarded(NATIVE), delivered, "the lifetime ledger matches");
    }

    /**
     * ⛔ The counter-test, and the one that would have justified naming the wallet directly if it
     * had passed: a plain address cannot sweep a launch it is the recipient of, because it cannot
     * make a call at all. Here the launch's recipient is the treasury, so an EOA pretending to be
     * the recipient is refused -- which is the same wall a wallet-as-recipient design hits from
     * the inside.
     */
    function test_aStrangerCannotSweepTheCurveDirectly() public {
        if (!forked || !FACTORY.launchEnabled()) {
            console.log("SKIP: no fork, or Pons has launches disabled.");
            return;
        }

        IPonsV2Factory.LaunchParams memory p;
        p.name = "Guard";
        p.symbol = "GUARD";
        p.socials = IPonsV2Factory.Socials("", "", "", "", "");
        p.salt = keccak256("ponsfund-guard-1");

        uint256 fee = FACTORY.launchFee();
        vm.deal(LAUNCHER, fee + 1 ether);
        vm.prank(LAUNCHER);
        (, address curve) = launchpad.launch{value: fee}(p, 0, NATIVE, 0, 0);

        vm.deal(TRADER, 5 ether);
        vm.prank(TRADER);
        ICurve(curve).buy{value: 2 ether}(2 ether, 0, TRADER);

        // Straight at the curve, from an address that is not the fee recipient.
        vm.prank(address(0xBEEF));
        vm.expectRevert();
        ICurve(curve).sell(0, 0, address(0xBEEF)); // any call path; the sweep below is the real one

        vm.prank(address(0xBEEF));
        (bool ok,) = curve.call(abi.encodeWithSignature("sweepFees(uint256)", uint256(0)));
        assertFalse(ok, "only the fee recipient may sweep -- this is why the treasury is a contract");
    }
}
