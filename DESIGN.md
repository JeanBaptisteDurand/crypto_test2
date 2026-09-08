# PonsFund on Pons V2 — design

> Written 2026-09-08. Supersedes nothing; this is the first design for PonsFund's own launchpad.
> Decisions in §1 were taken by the user on 2026-09-08 and are not open for re-litigation.

## 0. Why this exists

PonsFund's site already contains a working launch form: it connects a wallet and deploys a token
through the **Clanker v4 SDK** from the visitor's browser. That works — Clanker's v4 factory is live
on Robinhood Chain at `0xD3f2cC1731b7Fd17f28798835C2E02f0a1839A94` (bytecode verified 2026-09-08).

The user asked for something else: to do what **openpons.pro** does. OpenPons does not use Clanker.
It calls the **Pons V2 launch factory** directly. Those are two unrelated protocols with different
curves, fee models and escrows, so "the same tech as OpenPons" necessarily means replacing Clanker.

## 1. Decisions taken (locked)

| Decision | Value |
|---|---|
| Launch engine | **Pons V2 factory**, replacing Clanker |
| Rehearsal | **anvil fork of Robinhood Chain mainnet**, not the public testnet |
| Fee destination | **100% of the creator-side fee to `0x7d85bF7a82470837A1d832e4fa503a7ebF20ca97`** |
| Launcher share | none |
| Platform share | none |
| Art direction | untouched — `BRIEF.md` §0 bis stays locked |

## 2. What was verified on chain (2026-09-08)

Every address below was probed with `eth_getCode` against the live RPCs.

| Contract | Mainnet (4663) | Testnet (46630) |
|---|---|---|
| Pons V2 factory `0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e` | 24 177 bytes | absent |
| Pons V2 launch router `0xe33e9e479df8802cb0866d5d05258bec4cf62948` | 4 416 bytes | — |
| OpenPons launchpad `0x3bC9a231E9F56351324daf6F9325a388797F09c0` | 17 935 bytes | absent |
| Clanker v4 factory `0xD3f2cC1731b7Fd17f28798835C2E02f0a1839A94` | present | absent |
| Permit2 `0x000000000022D473030F116dDEE9F6B43aC78BA3` | present | **9 152 bytes** |
| Uniswap V4 PoolManager `0x498581fF718922c3f8e6A244956aF099B2652b2b` | present | **absent** |
| Fee wallet `0x7d85bF7a82470837A1d832e4fa503a7ebF20ca97` | **EOA**, 0.6048 ETH | — |

**Consequence.** The public testnet has Permit2 but no Uniswap V4 and no Pons V2. Redeploying the
Pons V2 stack there would also mean deploying Uniswap V4 core and periphery, and would only ever
exercise a *copy* of Pons. An anvil fork of mainnet reaches the real factory, the real pools and the
real escrow for free. That is what OpenPons does, and it is what we do.

## 3. Source we can read and reuse

| What | Where | Licence |
|---|---|---|
| Pons V2, 9 contracts, full source | `github.com/ponsdotdev/ponsfamily` → `contractsV2/src/v2/` | MIT |
| OpenPons: launchpad, distributor, GitVault, V4Seller, keeper, verifier, front | `github.com/OpenPonsPro/OpenPons` | MIT |
| Pons V2 protocol docs | `docs.ponsfamily.com/v2` | — |

We integrate against Pons V2's **deployed** factory rather than redeploying it. Its source matters
for reading semantics and for writing fork tests, not for deployment.

## 4. The pivot that makes this possible

From `OpenPonsLaunchpad.sol`, flagged ⭐⭐ by its authors:

> `creatorFeeRecipient` **is a launch parameter** of the Pons V2 factory.

So the fee destination is fixed at launch, in the same transaction that creates the token. There is
no `transferCreatorFeeRecipient`, therefore no window in which a launch exists with its fees pointed
somewhere else. One signature, or nothing.

## 5. The constraint that shapes the contracts

Also from OpenPons, flagged ⛔⛔ and attributed to "trading on a fork and watching the sweep revert":

> `sweepFees` reverts `NotFeeSweepOperator()` for everyone except Pons's own operator and the
> launch's fee recipient.

Fees do not reach the escrow on their own. The curve must be *swept* first, and only the fee
recipient may sweep it. **If the fee recipient is an EOA, only the holder of that private key can
ever trigger a sweep** — one manual transaction per launch, then `claim()` on the escrow. At ten
launches that is twenty signed transactions, or a script holding the key permanently online.

This is why OpenPons's distributor is a contract: it *is* the fee recipient, and it exposes a
passthrough anyone can crank.

**Design response.** Honour the decision exactly — 100% of fees to `0x7d85bF7a…` — but interpose a
contract whose recipient is `immutable` and which has no owner, no setter and no withdrawal path.
Same destination, same amount, but the crank becomes permissionless and the whole path is readable
on the explorer.

## 6. Architecture

```
 trades on the Pons V2 curve ──1%──► Pons fee escrow (claim-based ledger)
         │  sweepFees + claim  (permissionless crank, via the treasury passthrough)
         ▼
 PonsFundTreasury          immutable RECIPIENT, no owner, no setter, no withdraw
         └── 100% ────────► 0x7d85bF7a82470837A1d832e4fa503a7ebF20ca97
```

### `PonsFundTreasury.sol`
- `RECIPIENT` — `immutable`, set once in the constructor.
- `receive()` — forwards everything that arrives to `RECIPIENT`.
- `sweepFees(address curve)` / `claim()` — permissionless passthroughs onto the curve and escrow,
  so anyone can move fees along without holding a key.
- No owner. No pause. No arbitrary call. Nothing to rotate.

### `PonsFundLaunchpad.sol`
- `launch(params, pairToken, devBuy)` — one transaction: calls the Pons V2 factory with
  `creatorFeeRecipient = treasury`, then appends the launch to an on-chain array.
- The register is **not cosmetic**. Robinhood Chain produces a block roughly every 100 ms and the
  public RPC caps `eth_getLogs` at 2 000 blocks — about three minutes of history. The site's feed
  therefore has to be an `eth_call` against an array, never an event scan. Multicall3 is deployed
  at the canonical address on this chain, so viem collapses the per-token reads into one request.
- No owner. A launcher who wants to keep their own fees can always call the Pons factory directly;
  what this contract guarantees is what "launched through PonsFund" means.

### Front end
- `src/lib/pons.ts` replaces `src/lib/clanker.ts`; `clanker-sdk` leaves the bundle.
- `src/lib/onchain.ts` reads our own register instead of querying Blockscout's log index.
- Wallet discovery moves to EIP-6963 (OpenPons's `eip6963.ts`, MIT).
- `packages/launch` gains a Pons path, for deploying `$PONSFUND` itself.

## 7. The copy problem, and what we do about it

The site and `BRIEF.md` currently promise:

> holders of `$PONSFUND` split the vault **every 24 hours**, pro rata, readable on the explorer.

With fees arriving at a wallet, **no contract performs that redistribution**. It becomes manual and
discretionary. Keeping the sentence would describe an on-chain mechanism that does not exist, which
rule 7 of the kit forbids.

A token launched through Pons V2 or Clanker is a fixed-supply ERC-20 with no transfer hook under our
control, so per-holder accrual cannot be checkpointed on chain at all. Honest pro-rata payout would
need an off-chain snapshot plus a Merkle claim, and a snapshot at a known hour can be bought right
before it.

**Resolution.** The 24-hour pro-rata promise comes off the site. The copy says what is true: swap
fees from every PonsFund launch fund the PonsFund treasury. If an on-chain distributing vault is
built later, the promise can come back with code behind it.

## 8. Phases

| Phase | Scope | Gate |
|---|---|---|
| 0 | Form fixes + fee config + copy. Front only, independently shippable. | — |
| 1 | Foundry scaffold in `packages/contracts/`, fork harness with `rpc-proxy.mjs`. Exit: a test that forks mainnet and reads `launchEnabled()` off the real factory. | — |
| 2 | The two contracts + fork tests over the full cycle: launch → trade → sweep → claim → the wallet's balance rises. | — |
| 3 | Front rewiring. Art direction untouched. | — |
| 4 | Mainnet deploy, then `$PONSFUND` itself, config writeback, `/ship`. | **Blocked**: kit rule 6 requires the user to type `deploy mainnet PONSFUND` in session. |

## 9. Phase 0 in detail

In `launches/ponsfund/src/components/sections/Create.tsx`:

- delete the **Project link** panel, `prefill()`, `lastSegment()`, `titleCase()`, the `ArrowRight`
  import and the `projectUrl` state — the field only ever pre-filled a name and a ticker, and
  Website and X already collect the links;
- delete the `Bar` component and the three-way `split` — there is nothing left to divide;
- delete the **Terms** panel's vault-share slider, `vaultBps`, `floorBps`, `maxVaultBps` and the
  `vaultFloorBps` import; the panel keeps the paired asset and gains one immutable line;
- delete the **In the banner** preview tile, keeping *Save as draft* and the drafts list;
- in the *What you are signing* card, drop `Platform fee`, `To you` and the bar; `To the treasury`
  reads 100%.

In `launches/ponsfund/launch.config.json`:

- `platform.feeBps: 0`, `platform.minVaultBps: 10000`;
- `vault.address: "0x7d85bF7a82470837A1d832e4fa503a7ebF20ca97"` — which also unblocks the form,
  whose `configured` check currently fails on a null vault address.

In `launches/ponsfund/src/lib/clanker.ts`: `splitFor` returns 100% vault, and the treasury address
is only required while `feeBps > 0`.

Copy: the 24-hour promise, per §7.

## 10. Open question, deliberately not decided here

The user's words were "la bannière … il faut dégager". Every other item in that message was scoped
to the launch form, so this design removes the form's **banner preview tile** only. The hero's
`LaunchStrip` is a different component, protected by `BRIEF.md` §0 bis and kit rules 2 and 10, and
is not touched without an explicit ask.

---

## 11. What implementation changed about this design

Phases 0 to 3 are built and committed. Four things were learned by doing, and this section is the
record of them.

**Native ETH is the zero address, and Pons does not list it as approved.** The first
`PonsFundLaunchpad` guarded the pair asset with `approvedPairTokens`, which returns **false** for
the zero address — native is special-cased inside the factory. That guard rejected the most common
launch there is. Caught by `test_fork_launchNamesTheTreasuryAsFeeRecipient` skipping its only real
assertion, then fixed. Checked live on 2026-09-08:

| Pair | `approvedPairTokens` |
| --- | --- |
| `0x0000…0000` native ETH | **false**, and valid anyway |
| USDG `0x5fc5360D…` | true |
| WETH `0x0Bd7D308…` from the old config | **false** — a Clanker-era address Pons does not take |

The zero address therefore means two different things in this codebase. For a treasury or a
launchpad it means "not configured" and `isRealAddress` rejects it; for a pair asset it means native
ETH and is valid. Both `lib/chain.ts` and the form carry that warning where it bites.

**Read off the live factory:** `launchEnabled` true, `launchFee` 0.0005 ETH, `maxCreatorTaxBps` 1000,
`feeEscrow` `0xd3AFEB2a57f70eF218Aa82451c51B2fb0416Ac9e`. The escrow is read from the factory rather
than hardcoded — it is not in Pons's published address table, and a wrong guess would make every
harvest a silent no-op that reads as "no fees yet".

**The read path cannot be lazy.** `lib/pons.ts` was meant to load on demand, but `onchain.ts` reads
the register on page load and imported it statically, which silently defeated the dynamic import —
Vite said so. The chain, the client and Pons's addresses now live in `lib/chain.ts`. viem's core is
in the first chunk unavoidably; only the launch path is lazy. Bundle went 1673 kB → 723 kB.

**§7 was carried out further than written.** The 24-hour promise appeared in seven places, not one:
tagline, description, hero points, three roadmap phases, the vault FAQ, `About.tsx` steps 03–04 and
all three `Vault.tsx` tiles. All rewritten. ⛔ **One remains and is deliberate**: the hero's
`Countdown` ticks to `vault.firstPayoutAt` and repeats every `vault.cycleHours`. It is inside the
hero that §0 bis locks, removing it is a layout and brand call rather than a correctness fix, and
its label reads "Next giveaway" while `giveaway.enabled` is false. **Awaiting the user's decision.**

## 12. Status

| Phase | State |
| --- | --- |
| 0 — form, fees, copy | done, `136a2e0` |
| 1 — fork harness | done, folded into `2814163` |
| 2 — contracts | done, `2814163`. 26 tests pass; the full cycle runs on a fork of live mainnet |
| 3 — front on Pons V2 | done, `c90b848` and `af5b1b4` |
| 4 — mainnet | **not started, and not startable here.** Kit rule 6 requires the user to type `deploy mainnet PONSFUND` in session |

Phase 4, when it runs: deploy `PonsFundTreasury` with `RECIPIENT = 0x7d85bF7a…` and the escrow read
off the factory, then `PonsFundLaunchpad` pointing at it, write both into `launch.config.json →
platform.launchpad` and `vault.address`, then `$PONSFUND` itself, then `/ship`.

⚠ Every address in both constructors is `immutable`. A mistake there is permanent.
