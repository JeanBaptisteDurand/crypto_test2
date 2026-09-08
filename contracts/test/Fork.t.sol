// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test, console} from "forge-std/Test.sol";
import {PonsFundTreasury} from "../src/PonsFundTreasury.sol";
import {PonsFundLaunchpad} from "../src/PonsFundLaunchpad.sol";
import {IPonsV2Factory, IPonsV2LaunchAndBuy, IPonsFeeEscrow} from "../src/interfaces/IPonsV2.sol";

/**
 * The integration tests, against the real Pons V2 on a fork of Robinhood Chain mainnet.
 *
 * ## Why a fork and not the testnet
 *
 * Robinhood Chain has a public testnet -- chain 46630, with an RPC, an explorer and a faucet that
 * all answer. Nothing we need is deployed on it. Checked with `eth_getCode` on 2026-09-08:
 *
 *   Pons V2 factory, router, fee escrow, meme hook   ALL ABSENT
 *   Uniswap V4 PoolManager (0x8366a39C…)              present, 24 009 bytes
 *   Permit2                                           present, 9 152 bytes
 *
 * ⚠ An earlier version of this note claimed Uniswap V4 was absent too. That was wrong: it was
 * checked at the canonical `0x498581fF…`, and Robinhood Chain uses a different address. V4 is there.
 * The blocker is Pons itself, which is absent, and Pons documents no testnet deployment.
 *
 * Standing the stack up there would mean deploying Pons's nine V2 contracts ourselves -- and mining
 * an address for `PonsV2MemeHook`, since Uniswap V4 encodes a hook's permissions in its address
 * bits. At the end of that you exercise a *copy* of Pons whose behaviour can drift. A fork reaches
 * the actual factory, the actual curves and the actual escrow, for free.
 *
 * ## ⚠ These tests SKIP when the proxy is not running
 *
 * Robinhood Chain's public RPC is behind Cloudflare, whose challenge fires on Foundry's User-Agent,
 * so `forge` cannot fork it directly -- see `scripts/rpc-proxy.mjs`. Rather than failing a whole
 * `forge test` for anyone who has not started the proxy, each test returns early. Run
 * `node scripts/rpc-proxy.mjs` in another terminal to actually exercise them, and read the console
 * output: a silent skip that looks like a pass is worse than a failure.
 */
contract ForkTest is Test {
    /// Verified on 2026-09-08: 24 177 bytes of code at this address on chain 4663.
    IPonsV2Factory constant FACTORY = IPonsV2Factory(0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e);
    /// Pons's launch-and-buy periphery. 4 416 bytes.
    IPonsV2LaunchAndBuy constant ROUTER = IPonsV2LaunchAndBuy(0xe33E9E479dF8802cb0866d5d05258bEc4cF62948);
    /// The production fee destination, matching `script/Deploy.s.sol`. An EOA with nonce 0.
    address constant RECIPIENT = 0x1C15359670c201812D4AE652BB0A232Ab70D9308;

    bool forked;
    PonsFundTreasury treasury;
    PonsFundLaunchpad launchpad;

    function setUp() public {
        try vm.createSelectFork(vm.envOr("RHC_RPC", string("http://127.0.0.1:8899"))) {
            forked = true;
        } catch {
            forked = false;
            return;
        }

        // If the fork came up but the factory is not there, we are pointed at the wrong chain, and
        // every assertion below would fail for a reason that has nothing to do with our code.
        if (address(FACTORY).code.length == 0) {
            forked = false;
            return;
        }

        IPonsFeeEscrow escrow = IPonsFeeEscrow(FACTORY.feeEscrow());
        treasury = new PonsFundTreasury(RECIPIENT, escrow);
        launchpad = new PonsFundLaunchpad(FACTORY, ROUTER, address(treasury));
    }

    modifier onlyForked() {
        if (!forked) {
            console.log("SKIP: no fork. Start `node scripts/rpc-proxy.mjs` and re-run.");
            return;
        }
        _;
    }

    /* ------------------------------------------------------- the chain is real -- */

    function test_fork_reachesTheRealPonsFactory() public onlyForked {
        assertEq(block.chainid, 4663, "forked the wrong chain");
        assertGt(address(FACTORY).code.length, 20_000, "factory bytecode");
        assertGt(address(ROUTER).code.length, 1_000, "router bytecode");

        console.log("launchEnabled     :", FACTORY.launchEnabled());
        console.log("launchFee (wei)   :", FACTORY.launchFee());
        console.log("maxCreatorTaxBps  :", FACTORY.maxCreatorTaxBps());
        console.log("feeEscrow         :", FACTORY.feeEscrow());
    }

    /**
     * The escrow address is read off the factory rather than hardcoded.
     *
     * ⚠ It is not in Pons's published address table, and a hardcoded guess that silently pointed at
     * an empty account would make every harvest a no-op that looks like "no fees yet".
     */
    function test_fork_feeEscrowIsAContract() public onlyForked {
        address escrow = FACTORY.feeEscrow();
        assertTrue(escrow != address(0), "escrow address");
        assertGt(escrow.code.length, 0, "escrow has code");
        assertEq(address(treasury.escrow()), escrow, "treasury points at it");
    }

    /* ---------------------------------------------------------- our deployment -- */

    function test_fork_ourContractsDeployAgainstTheRealFactory() public onlyForked {
        assertEq(treasury.RECIPIENT(), RECIPIENT);
        assertEq(launchpad.treasury(), address(treasury));
        assertEq(address(launchpad.factory()), address(FACTORY));
        assertEq(launchpad.launchCount(), 0);
    }

    /**
     * ⭐⭐ The claim the whole design rests on, checked against the deployed factory rather than
     * against its source: the economics digest is readable, so a launch can declare it.
     */
    function test_fork_economicsPreviewIsReadable() public onlyForked {
        bytes32 digest = FACTORY.previewLaunchEconomics(0, _nativePair());
        console.logBytes32(digest);
        assertTrue(digest != bytes32(0), "a zero digest would mean the guard is off");
    }

    /* ------------------------------------------------------------------ launch -- */

    /**
     * The end of the chain this project exists for: a launch through our launchpad names the
     * treasury as its fee recipient, on the real factory, and the register records it.
     *
     * ⚠ Skips rather than fails when Pons has launches closed. `launchEnabled()` is Pons's switch,
     * not ours, and a red suite because someone else paused their pad tells us nothing.
     */
    function test_fork_launchNamesTheTreasuryAsFeeRecipient() public onlyForked {
        if (!FACTORY.launchEnabled()) {
            console.log("SKIP: Pons has launches disabled right now.");
            return;
        }
        address pair = _nativePair();
        address launcher = address(0xA11CE);
        uint256 fee = FACTORY.launchFee();
        vm.deal(launcher, fee + 10 ether);

        IPonsV2Factory.LaunchParams memory params = IPonsV2Factory.LaunchParams({
            name: "ForkProbe",
            symbol: "PROBE",
            logo: "",
            description: "fork test",
            socials: IPonsV2Factory.Socials("", "", "", "", ""),
            // ⛔ Deliberately hostile input: the launcher asks for their own address and a fat tax.
            // The launchpad must overwrite all three, which is the point of the assertions below.
            creatorFeeRecipient: launcher,
            creatorTaxBps: 500,
            buybackEnabled: true,
            expectedEconomics: bytes32(0),
            salt: bytes32(0)
        });

        vm.prank(launcher);
        try launchpad.launch{value: fee}(params, 0, pair, 0, 0) returns (address token, address curve) {
            console.log("token             :", token);
            console.log("curve             :", curve);

            IPonsV2Factory.LaunchedToken memory rec = FACTORY.getLaunchedToken(token);
            assertEq(rec.creatorFeeRecipient, address(treasury), "fees must point at the treasury");
            assertEq(rec.creatorTaxBps, 0, "creator tax must be overwritten to zero");
            assertFalse(rec.buybackEnabled, "buyback must be overwritten off");
            assertEq(rec.deployer, address(launchpad), "the launchpad is the deployer of record");

            assertEq(launchpad.launchCount(), 1, "the register recorded it");
            PonsFundLaunchpad.Launch memory entry = launchpad.launchAt(0);
            assertEq(entry.token, token);
            assertEq(entry.curve, curve);
            assertEq(entry.launcher, launcher, "the register credits the caller, not the launchpad");
        } catch (bytes memory err) {
            /* Surfaced, never swallowed. A launch can legitimately fail here -- a launchConfigId
               that does not exist, a pair asset Pons has since de-approved -- and the selector is
               the only thing that says which. Failing the test with the bytes printed beats a
               green run that proved nothing. */
            console.log("launch reverted; selector below");
            console.logBytes(err);
            fail("launch reverted on the fork -- see the selector above");
        }
    }

    /* ------------------------------------------------------------------ helper -- */

    /**
     * Native ETH, which on Pons is the zero address.
     *
     * ⛔ Deliberately NOT filtered through `approvedPairTokens`. That mapping returns **false** for
     * the zero address -- native is special-cased inside Pons -- so screening for it here is what
     * made the first version of this test skip the only assertion that mattered. Checked live on
     * 2026-09-08; the numbers are in the note on `PonsFundLaunchpad.launch`.
     */
    function _nativePair() internal pure returns (address) {
        return address(0);
    }

    /** An approved ERC-20 pair, to prove the mapping guard works for the case it does cover. */
    function test_fork_theApprovedPairMappingCoversErc20sOnly() public onlyForked {
        address usdg = 0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168;
        assertTrue(FACTORY.approvedPairTokens(usdg), "USDG is approved");
        assertFalse(FACTORY.approvedPairTokens(address(0)), "native is not in the mapping");
        assertFalse(
            FACTORY.approvedPairTokens(0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73),
            "the config's WETH is a Clanker-era address Pons does not take"
        );
    }
}
