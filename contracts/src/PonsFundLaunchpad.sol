// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IPonsV2Factory, IPonsV2LaunchAndBuy} from "./interfaces/IPonsV2.sol";

/**
 * One transaction that creates a token whose fees can only ever reach the PonsFund treasury.
 *
 * ## What one call does
 *
 * 1. Overwrites the fee terms in the caller's `LaunchParams` with this launchpad's own -- the
 *    treasury as `creatorFeeRecipient`, no creator tax, no buyback.
 * 2. Reads Pons's economics digest live and declares it, so the launch cannot be created under
 *    terms that shifted between the quote and the signature.
 * 3. Launches on Pons V2, with the deployer's first buy in the same transaction if they asked for
 *    one.
 * 4. Appends the launch to an on-chain array, which is how the site finds it again.
 *
 * ## ⛔⛔ WHY THE FEE TERMS ARE OVERWRITTEN AND NOT VALIDATED
 *
 * The caller hands over a `LaunchParams` and this contract rewrites three of its fields rather than
 * checking them and reverting. That is deliberate. A validating launchpad has to describe what it
 * rejects, and every description is a chance to be subtly wrong -- while an overwriting one cannot
 * be wrong at all: whatever a caller puts in those fields, what reaches Pons is the treasury.
 *
 * ⚠ It also means a launcher cannot be tricked by a crafted link into launching with their own
 * address as the fee recipient. There is exactly one fee destination reachable through here.
 *
 * A launcher who wants to keep their own fees can of course call the Pons factory directly. What
 * this contract guarantees is what "launched through PonsFund" means, and nothing more.
 *
 * ## ⭐⭐ WHY THERE IS A REGISTER, WHICH LOOKS LIKE DUPLICATION
 *
 * Pons already emits a `TokenLaunched` event, so an array of launches looks like storing what the
 * chain already has. On this chain it is not.
 *
 * Robinhood Chain produces a block roughly every 100 ms, and its public RPC caps `eth_getLogs` at
 * 2 000 blocks -- about **three minutes** of history. A site that read its own launch feed from
 * events would show the last three minutes and call it the archive. So the feed is an array read
 * with `eth_call`, and Multicall3 is deployed at the canonical address here, which lets viem
 * collapse the per-token reads into a single request.
 *
 * There is no owner and no pause. A launchpad that can be switched off is one whose register can
 * stop matching the chain.
 */
contract PonsFundLaunchpad {
    /* ------------------------------------------------------------------ config -- */

    /// Pons V2's launch factory: `0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e` on Robinhood Chain.
    IPonsV2Factory public immutable factory;

    /**
     * Pons's launch-and-buy periphery: `0xe33e9e479df8802cb0866d5d05258bec4cf62948`.
     *
     * ⚠ Only used when the launcher asks for a developer buy. For a launch with no first buy the
     * plain factory call is sent instead -- a different entrypoint, not a variant of the same one.
     */
    IPonsV2LaunchAndBuy public immutable router;

    /// Every launch made here names this as its `creatorFeeRecipient`, immutably.
    address public immutable treasury;

    /* ---------------------------------------------------------------- register -- */

    struct Launch {
        address token;
        address curve;
        address launcher;
        address pairToken;
        uint64 at;
    }

    /**
     * Every launch, oldest first.
     *
     * ⚠ Deliberately not a mapping. The site needs the whole list in page order and cannot
     * enumerate a mapping, and `launchCount` plus a slice is one round trip where an event scan is
     * impossible (see the note on the contract).
     */
    Launch[] private _launches;

    /// Guards against the same token being registered twice if Pons ever returns a reused address.
    mapping(address token => bool registered) public isLaunch;

    event Launched(
        address indexed token, address indexed curve, address indexed launcher, address pairToken, uint256 index
    );

    error ZeroAddress();
    error LaunchesClosed();
    error PairTokenNotApproved();
    error AlreadyRegistered();
    error BadRange();

    constructor(IPonsV2Factory factory_, IPonsV2LaunchAndBuy router_, address treasury_) {
        if (address(factory_) == address(0) || address(router_) == address(0) || treasury_ == address(0)) {
            revert ZeroAddress();
        }
        factory = factory_;
        router = router_;
        treasury = treasury_;
    }

    /* ------------------------------------------------------------------ launch -- */

    /**
     * Launch a token whose fees go to the treasury.
     *
     * @param params        The launcher's metadata. Its `creatorFeeRecipient`, `creatorTaxBps`,
     *                      `buybackEnabled` and `expectedEconomics` fields are overwritten.
     * @param launchConfigId Pons's launch configuration to use.
     * @param pairToken     The asset the curve and the future pool are denominated in.
     * @param devBuyQuoteIn The launcher's first buy, in the pair asset's own units. Zero for none.
     * @param minTokensOut  Slippage floor on that first buy. Ignored when `devBuyQuoteIn` is zero.
     *
     * ⚠⚠ `msg.value` must be EXACT. Pons checks `launchFee + quoteIn` for a native pair and
     * `launchFee` alone otherwise, and reverts on anything else -- there is no slack and no tip. The
     * value is forwarded untouched rather than recomputed here, so the caller reads Pons's own
     * `launchFee()` and sends what it says.
     */
    function launch(
        IPonsV2Factory.LaunchParams memory params,
        uint256 launchConfigId,
        address pairToken,
        uint256 devBuyQuoteIn,
        uint256 minTokensOut
    ) external payable returns (address token, address curve) {
        /* Read live, both of them. `launchEnabled` can be turned off by Pons and `approvedPairTokens`
           can change; failing here with a name is worth more than Pons's own revert reaching a
           launcher as an unlabelled 0x. */
        if (!factory.launchEnabled()) revert LaunchesClosed();

        /* ⛔⛔ NATIVE ETH IS THE ZERO ADDRESS AND IS **NOT** IN `approvedPairTokens`.
           Checked against the live factory on 2026-09-08:

             approvedPairTokens(0x0000…0000)  false   <- native ETH, and a perfectly valid pair
             approvedPairTokens(USDG)         true
             approvedPairTokens(AAPL)         true

           The mapping covers ERC-20s only; native is special-cased inside Pons. Guarding it with a
           plain `approvedPairTokens` call therefore rejects the most common launch there is, which
           is what the first run of `test_fork_launchNamesTheTreasuryAsFeeRecipient` did.

           ⚠ Also worth knowing: `0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73`, the WETH address in
           `launch.config.json`, is a Clanker-era address and returns false here. Pons does not take
           wrapped ETH -- it takes the native asset, as the zero address. */
        if (pairToken != address(0) && !factory.approvedPairTokens(pairToken)) revert PairTokenNotApproved();

        /* ⛔⛔ The three fields that make this a PonsFund launch. Overwritten, never validated --
           see the note on the contract. */
        params.creatorFeeRecipient = treasury;
        params.creatorTaxBps = 0;
        params.buybackEnabled = false;

        /* ⚠ Read now, not cached. This is Pons's guard against the terms moving between the quote
           and the signature; a stale digest turns the guard off. */
        params.expectedEconomics = factory.previewLaunchEconomics(launchConfigId, pairToken);

        if (devBuyQuoteIn == 0) {
            (token, curve) = factory.launchToken{value: msg.value}(params, launchConfigId, pairToken);
        } else {
            /* The launch and the buy land together, so there is no intermediate state for a bot to
               trade against. A follow-up buy is a separate block, and pays the snipe tax too. */
            address[] memory noExemptions = new address[](0);
            (token, curve,) = router.launchAndBuy{value: msg.value}(
                params, launchConfigId, pairToken, devBuyQuoteIn, minTokensOut, msg.sender, noExemptions
            );
        }

        if (isLaunch[token]) revert AlreadyRegistered();
        isLaunch[token] = true;
        _launches.push(
            Launch({
                token: token,
                curve: curve,
                launcher: msg.sender,
                pairToken: pairToken,
                at: uint64(block.timestamp)
            })
        );
        emit Launched(token, curve, msg.sender, pairToken, _launches.length - 1);
    }

    /* ------------------------------------------------------------------- reads -- */

    function launchCount() external view returns (uint256) {
        return _launches.length;
    }

    function launchAt(uint256 index) external view returns (Launch memory) {
        return _launches[index];
    }

    /**
     * A page of the register, newest first.
     *
     * Newest first because that is the order the site draws, and reversing 200 entries in a
     * browser to show 12 is work done in the wrong place.
     *
     * @param offset How many of the newest to skip.
     * @param limit  How many to return. Clamped to what remains, so asking for more than exists
     *               returns a short array rather than reverting -- a feed should not 500 because it
     *               guessed the page size.
     */
    function latest(uint256 offset, uint256 limit) external view returns (Launch[] memory page) {
        uint256 total = _launches.length;
        if (offset > total) revert BadRange();
        uint256 remaining = total - offset;
        uint256 n = limit < remaining ? limit : remaining;
        page = new Launch[](n);
        for (uint256 i = 0; i < n; i++) {
            page[i] = _launches[total - 1 - offset - i];
        }
    }
}
