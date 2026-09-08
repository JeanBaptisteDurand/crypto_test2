// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test, console} from "forge-std/Test.sol";
import {PonsFundTreasury} from "../src/PonsFundTreasury.sol";
import {PonsFundLaunchpad} from "../src/PonsFundLaunchpad.sol";
import {IPonsV2Factory, IPonsV2LaunchAndBuy, IPonsFeeEscrow} from "../src/interfaces/IPonsV2.sol";

interface ICurve {
    function buy(uint256 quoteIn, uint256 minTokensOut, address recipient) external payable returns (uint256);
    function sell(uint256 tokensIn, uint256 minQuoteOut, address recipient) external returns (uint256);
}

interface IERC20Bal {
    function balanceOf(address) external view returns (uint256);
    function approve(address, uint256) external returns (bool);
}

/**
 * HOW MUCH OF A TRADE ACTUALLY REACHES THE TREASURY.
 *
 * ## Why this test exists
 *
 * "Do we get all the fees?" cannot be answered from Pons's fee policy alone. Read live on
 * 2026-09-08 it says:
 *
 *   hookFeeBps            100   -> 1.00% total fee on a swap
 *   protocolFeeShareBps  3000   -> 30% of it to Pons
 *   buybackBurnBps       5000   -> 50%, but only where a buyback runs
 *
 * Our launches set `buybackEnabled = false`, so whether that 50% is taken anyway, skipped, or
 * redirected is not something the numbers say. `FeeFlow.t.sol` does not answer it either: it trades
 * in the same block as the launch, so its figure is dominated by the snipe tax and is useless as a
 * steady-state rate.
 *
 * ⭐ So this measures it. Warp past the snipe decay, trade a known amount, crank, and divide.
 *
 * ⚠ The result is a measurement, not a promise. Pons owns the policy and can change it -- which is
 * exactly why nothing in this codebase hardcodes a percentage.
 */
contract FeeShareTest is Test {
    IPonsV2Factory constant FACTORY = IPonsV2Factory(0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e);
    IPonsV2LaunchAndBuy constant ROUTER = IPonsV2LaunchAndBuy(0xe33E9E479dF8802cb0866d5d05258bEc4cF62948);
    address constant NATIVE = address(0);
    address constant LAUNCHER = 0x00000000000000000000000000000000CaFe0003;
    address constant TRADER = 0x00000000000000000000000000000000caFe0004;
    address constant DESTINATION = 0x00000000000000000000000000000000Cafe0007;

    /// Far past any decaying tax. Pons's decay is measured in seconds; an hour is not a close call.
    uint256 constant SETTLE = 1 hours;
    /**
     * ⛔⛔ MUST STAY UNDER THE GRADUATION THRESHOLD, WHICH IS 4.2 ETH ON THIS CONFIG.
     *
     * A 10 ETH buy graduated the curve and `sweepFees` then reverted `AlreadyGraduated()`
     * (0xe6a0d45f) -- fees move to the Uniswap V4 pool and are swept off the meme hook instead, via
     * `treasury.sweepPool`. That is a different measurement, so this one stays on the curve.
     *
     * ⭐ It also explains why `FeeFlow.t.sol` gets away with 10 ETH: it trades in the launch block,
     * the snipe tax eats ~69% of the buy, and barely 3 ETH reaches the reserve -- under the
     * threshold. Let the tax decay and the same buy graduates. Two tests, two regimes.
     */
    uint256 constant BUY = 1 ether;

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

    function test_whatShareOfATradeReachesTheTreasury() public {
        if (!forked || !FACTORY.launchEnabled()) {
            console.log("SKIP: no fork, or Pons has launches disabled.");
            return;
        }

        IPonsV2Factory.LaunchParams memory p;
        p.name = "Fee Share";
        p.symbol = "SHARE";
        p.socials = IPonsV2Factory.Socials("", "", "", "", "");
        p.salt = keccak256("ponsfund-fee-share-1");

        uint256 fee = FACTORY.launchFee();
        vm.deal(LAUNCHER, fee + 1 ether);
        vm.prank(LAUNCHER);
        (address token, address curve) = launchpad.launch{value: fee}(p, 0, NATIVE, 0, 0);

        /* ⭐⭐ THE WHOLE POINT OF THIS TEST. Trading in the launch block pays the snipe tax at its
           maximum, which is what makes FeeFlow's number look like a 69% fee. Rolling time forward
           lets the tax decay to Pons's ordinary rate, which is the rate a real token earns for the
           rest of its life. */
        vm.warp(block.timestamp + SETTLE);
        vm.roll(block.number + 100);

        vm.deal(TRADER, BUY * 3);
        vm.prank(TRADER);
        ICurve(curve).buy{value: BUY}(BUY, 0, TRADER);

        // Crank it: sweep the curve through the treasury, then claim the escrow. Both permissionless.
        vm.prank(address(0xBEEF));
        treasury.sweepCurve(curve, 0);

        uint256 claimable = IPonsFeeEscrow(FACTORY.feeEscrow()).balanceOf(address(treasury));
        uint256 before = DESTINATION.balance;
        vm.prank(address(0xDEAD));
        treasury.harvest();
        uint256 delivered = DESTINATION.balance - before;

        // Basis points of the traded volume that ended up in the destination wallet.
        uint256 bps = (delivered * 10_000) / BUY;

        console.log("");
        console.log("  bought (wei)              :", BUY);
        console.log("  claimable in escrow (wei) :", claimable);
        console.log("  delivered to wallet (wei) :", delivered);
        console.log("  share of volume (bps)     :", bps);
        console.log("  i.e. percent x100         :", bps);
        console.log("");

        assertEq(delivered, claimable, "the wallet gets the whole claim, not a share of it");
        assertGt(delivered, 0, "a settled trade produced no fee at all");
        /* ⚠ Bounded, not pinned. The total swap fee is 1% and Pons keeps 30% of it, so a
           creator-side share above the full 1% would mean this is still measuring a snipe tax and
           the number must not be quoted as a steady-state rate. */
        assertLt(bps, 100, "still measuring a decaying tax, not the ordinary fee");
    }
}
