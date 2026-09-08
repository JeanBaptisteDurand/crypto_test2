// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/**
 * The parts of Pons V2 that PonsFund transacts with.
 *
 * These are interfaces against contracts that are already deployed and are not ours: we do not
 * redeploy Pons, we call it. The shapes below were read off the official source at
 * `github.com/ponsdotdev/ponsfamily` (`contractsV2/src/v2/`, MIT) and cross-checked against the
 * interfaces OpenPons wrote for the same factory (`github.com/OpenPonsPro/OpenPons`, MIT).
 *
 * Live addresses on Robinhood Chain, chain id 4663, verified with `eth_getCode` on 2026-09-08:
 *
 *   PonsV2LaunchFactory   0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e   24 177 bytes
 *   PonsV2LaunchAndBuy    0xe33E9E479dF8802cb0866d5d05258bEc4cF62948    4 416 bytes
 *   PonsV2MemeHook        0xe5e702641ea86f4ae6cc3cdaed2b886f976be044
 *
 * ⚠ Blockscout reports the factory as a verified "StubContract" compiled with solc 0.8.7 in
 * February 2023. That is a misleading bytecode match on the explorer, not the real source: the
 * account holds 24 KB of dispatch code and its EIP-1967 implementation slot is zero, so it is
 * neither a stub nor a proxy. Read the semantics off the GitHub source, never off that page.
 */

/**
 * Pons V2's launch factory.
 *
 * ⭐⭐ `creatorFeeRecipient` IS A LAUNCH PARAMETER, and that single fact is what makes PonsFund
 * possible at all. The fee destination is chosen in the same transaction that creates the token,
 * and there is no `transferCreatorFeeRecipient` afterwards -- so there is no window in which a
 * launch exists with its fees pointed somewhere other than the treasury. One signature, or nothing.
 */
interface IPonsV2Factory {
    struct Socials {
        string twitter;
        string telegram;
        string discord;
        string website;
        string farcaster;
    }

    struct LaunchParams {
        string name;
        string symbol;
        string logo;
        string description;
        Socials socials;
        address creatorFeeRecipient;
        uint16 creatorTaxBps;
        bool buybackEnabled;
        bytes32 expectedEconomics;
        bytes32 salt;
    }

    struct LaunchedToken {
        address token;
        address curve;
        address deployer;
        address creatorFeeRecipient;
        address pairToken;
        uint256 graduationThreshold;
        uint24 poolFee;
        int24 tickSpacing;
        uint16 creatorTaxBps;
        bool buybackEnabled;
        uint8 phase;
        uint256 sweptQuote;
        uint256 sweptTokens;
        uint256 sweptAt;
        bool exists;
    }

    function launchToken(LaunchParams calldata params, uint256 launchConfigId, address pairToken)
        external
        payable
        returns (address token, address curve);

    function launchEnabled() external view returns (bool);
    function launchFee() external view returns (uint256);
    function maxCreatorTaxBps() external view returns (uint256);
    function approvedPairTokens(address pairToken) external view returns (bool);

    /**
     * The economics digest a launch must declare up front.
     *
     * ⚠ Read live and passed straight back into `launchToken` as `expectedEconomics`. It is Pons's
     * guard against a launch being created under terms that changed between the quote and the
     * signature; hardcoding or caching it turns that guard off.
     */
    function previewLaunchEconomics(uint256 launchConfigId, address pairToken) external view returns (bytes32);

    function getLaunchedToken(address token) external view returns (LaunchedToken memory);
    function feeEscrow() external view returns (address);
}

/**
 * Pons's periphery: the launch and the deployer's first buy settled in ONE transaction.
 *
 * ⛔ The only way to buy at launch without being sniped -- a buy sent as a follow-up transaction is
 * a separate block for a bot to get in front of.
 *
 * ⚠⚠ Its native value check is EXACT: `launchFee + quoteIn` for a native pair, `launchFee` alone
 * otherwise. Anything else reverts. There is no slack and no tip.
 */
interface IPonsV2LaunchAndBuy {
    function launchAndBuy(
        IPonsV2Factory.LaunchParams calldata params,
        uint256 launchConfigId,
        address pairToken,
        uint256 quoteIn,
        uint256 minTokensOut,
        address recipient,
        address[] calldata snipeTaxExemptions
    ) external payable returns (address token, address curve, uint256 tokensOut);
}

/**
 * Pons's claim-based fee ledger. Fees are credited to a recipient here and pulled, not pushed.
 *
 * This is why a fee recipient that cannot make calls -- a plain wallet -- needs somebody to sign a
 * claim for it. See the note on `sweepFees` below, which is the harder half of the same problem.
 */
interface IPonsFeeEscrow {
    function balanceOf(address recipient) external view returns (uint256);
    function balanceOfToken(address recipient, address token) external view returns (uint256);
    function claim() external returns (uint256);
    function claimToken(address token) external returns (uint256);
}

/**
 * The per-launch bonding curve, for the one call the treasury has to be able to make on it.
 *
 * ⛔⛔ `sweepFees` REVERTS `NotFeeSweepOperator()` FOR EVERYONE EXCEPT PONS'S OWN OPERATOR AND THE
 * LAUNCH'S FEE RECIPIENT. Fees do not reach the escrow on their own: the curve must be swept first,
 * and only the recipient may sweep it.
 *
 * That is the reason `PonsFundTreasury` is a contract and not the destination wallet itself. Had the
 * wallet been named as `creatorFeeRecipient` directly, only the holder of its private key could ever
 * trigger a sweep -- one signed transaction per launch, forever. The treasury forwards this call for
 * anyone, which is what makes the whole path crankable by a stranger.
 *
 * Credit where due: OpenPons found this by trading on a fork and watching the sweep revert, and
 * flagged it ⛔⛔ in their distributor. It is not documented anywhere else we could find.
 */
interface IPonsCurveSweep {
    function sweepFees(uint256 minBuybackTokensOut) external;
}

/** The same, for a launch that has graduated onto its Uniswap V4 pool. */
interface IPonsHookSweep {
    function sweepPoolFees(bytes32 poolId, uint256 minConversionQuoteOut, uint256 minBuybackTokensOut) external;
}
