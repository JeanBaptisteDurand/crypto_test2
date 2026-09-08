// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IERC20} from "openzeppelin-contracts/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "openzeppelin-contracts/contracts/token/ERC20/utils/SafeERC20.sol";
import {IPonsFeeEscrow, IPonsCurveSweep, IPonsHookSweep} from "./interfaces/IPonsV2.sol";

/**
 * Where the fees from every PonsFund launch go, decided once and then not decidable again.
 *
 * ## What this contract is
 *
 * It is the `creatorFeeRecipient` of every launch made through `PonsFundLaunchpad`. It pulls their
 * fees out of Pons's shared escrow and forwards **all of them** to one address that was fixed at
 * construction. That is the entire contract. No owner, no setter, no upgrade path, no pause, no
 * arbitrary-call function, no withdraw.
 *
 * ## ⛔⛔ WHY THIS CONTRACT EXISTS AT ALL, RATHER THAN NAMING THE WALLET DIRECTLY
 *
 * The decision it implements is "100% of the creator-side fee to one wallet". A wallet address can
 * be written straight into `LaunchParams.creatorFeeRecipient`, and that looks like the simpler
 * design. It is not, because of one line in Pons:
 *
 *   `sweepFees` reverts `NotFeeSweepOperator()` for everyone except Pons's own operator and the
 *   launch's fee recipient.
 *
 * Fees do not arrive in the escrow on their own. The curve has to be swept, and only the recipient
 * may sweep it. Name a plain wallet and **only the holder of that private key can ever move a
 * launch's fees**: one signed transaction per launch to sweep, another to claim, forever, or a
 * script holding the key permanently online. At ten launches that is twenty signatures a cycle.
 *
 * A contract as the recipient turns that around. `sweepFees` and `claim` become passthroughs any
 * stranger can call, and the money still lands in exactly the same wallet. Same destination, same
 * amount, no key involved.
 *
 * ## ⭐⭐ WHY THERE IS NO OWNER
 *
 * `RECIPIENT` is `immutable`. Once this is deployed, no key in existence can point its fees
 * anywhere else, and anyone can read that off the verified source in ten seconds. That is worth
 * more than a promise on a website, and it is the whole reason to prefer this over a multisig with
 * a setter.
 *
 * ⚠⚠ It follows that a mistake in the constructor is PERMANENT. Deploy against a fork first.
 *
 * ## What this contract does NOT do
 *
 * It does not distribute to `$PONSFUND` holders. Nothing here splits, schedules or pays out pro
 * rata. It forwards to one wallet, and what happens after that is off chain and discretionary. Any
 * copy that promises holders an automatic share is describing a mechanism that does not exist --
 * see §7 of `docs/superpowers/specs/2026-09-08-ponsfund-pons-v2-launchpad-design.md`.
 */
contract PonsFundTreasury {
    using SafeERC20 for IERC20;

    /* ------------------------------------------------------------------ config -- */

    /**
     * The one and only destination. Immutable, so this is the whole trust statement.
     *
     * Set to `0x7d85bF7a82470837A1d832e4fa503a7ebF20ca97` on Robinhood Chain -- an externally owned
     * account, checked on 2026-09-08. It is passed in rather than hardcoded so the fork tests can
     * deploy against an address they control.
     */
    address public immutable RECIPIENT;

    /// Pons's shared fee ledger. Read off the factory at deploy time; see the launchpad's constructor.
    IPonsFeeEscrow public immutable escrow;

    /* ------------------------------------------------------------------ ledger -- */

    /**
     * Lifetime totals per asset, native keyed by `address(0)`.
     *
     * The site renders these with one `eth_call`. It cannot read them off events instead: Robinhood
     * Chain makes a block roughly every 100 ms and the public RPC caps `eth_getLogs` at 2 000
     * blocks, about three minutes of history, so an event scan can only ever show the recent past.
     */
    mapping(address asset => uint256 total) public totalForwarded;

    event Harvested(address indexed asset, uint256 amount);
    event Forwarded(address indexed asset, uint256 amount);

    error ZeroAddress();
    error TransferFailed();

    constructor(address recipient_, IPonsFeeEscrow escrow_) {
        if (recipient_ == address(0) || address(escrow_) == address(0)) revert ZeroAddress();
        RECIPIENT = recipient_;
        escrow = escrow_;
    }

    /// Fees swept out of a curve land here before they are forwarded on.
    receive() external payable {}

    /* ----------------------------------------------------------------- harvest -- */

    /**
     * Pull native fees out of the escrow and push them to the recipient.
     *
     * Permissionless on purpose: the contract enforces the destination, so there is no reason to
     * care who pays the gas -- and a permissioned harvest is one that stops the day a key goes
     * quiet.
     */
    function harvest() public returns (uint256 gained) {
        uint256 before = address(this).balance;
        /* ⚠ `try`, not a bare call. An escrow with nothing credited reverts rather than returning
           zero, and a cranker sweeping several launches in one transaction should not have the
           whole batch fail on the one that had no fees yet. */
        try escrow.claim() {} catch {}
        gained = address(this).balance - before;
        if (gained != 0) emit Harvested(address(0), gained);
        forward();
    }

    /** The same for a launch paired against an ERC-20. */
    function harvestToken(address asset) public returns (uint256 gained) {
        if (asset == address(0)) revert ZeroAddress();
        uint256 before = IERC20(asset).balanceOf(address(this));
        try escrow.claimToken(asset) {} catch {}
        gained = IERC20(asset).balanceOf(address(this)) - before;
        if (gained != 0) emit Harvested(asset, gained);
        forwardToken(asset);
    }

    /// One call for a cranker: native plus every asset a set of launches might pay in.
    function harvestMany(address[] calldata assets) external {
        harvest();
        for (uint256 i = 0; i < assets.length; i++) harvestToken(assets[i]);
    }

    /* ------------------------------------------------------------------- sweep -- */

    /**
     * Move a launch's fees off its curve and into the escrow, so `harvest` has something to claim.
     *
     * ⭐⭐ PERMISSIONLESS, WHICH IS THE ENTIRE POINT OF THIS CONTRACT. Pons accepts this call only
     * from the launch's fee recipient, and that is this contract. Opening it to anyone means the
     * full chain of sweep, harvest and payout can be run by a stranger or a cron, with no key of
     * ours involved.
     *
     * ⛔ Only this one call is forwarded, and it can do nothing but move money TO this contract. An
     * arbitrary-call version of this function would be a way to drain it.
     *
     * ⚠ `minBuybackTokensOut` is Pons's slippage floor for the buyback leg. The launchpad disables
     * the buyback, so no swap happens and the value is inert -- exposed anyway rather than pinned to
     * zero, for a caller who does need it.
     */
    function sweepCurve(address curve, uint256 minBuybackTokensOut) external {
        IPonsCurveSweep(curve).sweepFees(minBuybackTokensOut);
    }

    /** The same for a launch that has graduated onto its Uniswap V4 pool. */
    function sweepPool(address hook, bytes32 poolId, uint256 minConversionQuoteOut, uint256 minBuybackTokensOut)
        external
    {
        IPonsHookSweep(hook).sweepPoolFees(poolId, minConversionQuoteOut, minBuybackTokensOut);
    }

    /* ----------------------------------------------------------------- forward -- */

    /**
     * Send everything held to the recipient.
     *
     * ⭐⭐ WORKS OFF THE BALANCE, NEVER OFF WHAT THE HARVEST RETURNED. Two reasons, and the second
     * is the one that bites. First, a direct donation to this address should reach the recipient on
     * the same terms as a fee. Second, `escrow.claim()` is wrapped in a `try`, so a claim that
     * succeeded while a later step reverted would leave money here that no return value ever
     * mentioned -- exactly the shape where funds sit unattributed forever.
     *
     * Public and permissionless, so a stuck balance is recoverable by anyone at all. There is only
     * one address it can go to.
     */
    function forward() public returns (uint256 sent) {
        sent = address(this).balance;
        if (sent == 0) return 0;
        totalForwarded[address(0)] += sent;
        emit Forwarded(address(0), sent);
        /* ⚠ `call` and not `transfer`: the 2300-gas stipend is not enough for a recipient that is a
           contract, and while the configured recipient is an EOA today, a treasury that breaks if
           that ever changes is a treasury with a trap in it. */
        (bool ok,) = RECIPIENT.call{value: sent}("");
        if (!ok) revert TransferFailed();
    }

    /** The same for an ERC-20 balance. */
    function forwardToken(address asset) public returns (uint256 sent) {
        if (asset == address(0)) revert ZeroAddress();
        sent = IERC20(asset).balanceOf(address(this));
        if (sent == 0) return 0;
        totalForwarded[asset] += sent;
        emit Forwarded(asset, sent);
        IERC20(asset).safeTransfer(RECIPIENT, sent);
    }
}
