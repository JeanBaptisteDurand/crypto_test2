# packages/contracts

PonsFund's two contracts, and the fork harness that tests them against the real Pons V2.

## What is here

| | |
| --- | --- |
| `src/PonsFundTreasury.sol` | The `creatorFeeRecipient` of every PonsFund launch. Forwards 100% to one immutable address. No owner, no setter, no withdraw. |
| `src/PonsFundLaunchpad.sol` | One transaction: launch on Pons V2 with the treasury as fee recipient, and append to an on-chain register. No owner. |
| `src/interfaces/IPonsV2.sol` | Interfaces against Pons V2, which is deployed and is not ours. |
| `scripts/rpc-proxy.mjs` | A loopback JSON-RPC proxy. Exists because Cloudflare 403s Foundry's User-Agent. |

## Setup

`lib/` is gitignored — committing forge-std and OpenZeppelin in full is thousands of files for no
gain. Install them once:

```bash
forge install foundry-rs/forge-std --no-git
forge install OpenZeppelin/openzeppelin-contracts --no-git
forge build
```

## Testing

There is **no Pons V2 on the Robinhood Chain testnet**, and no Uniswap V4 either — both checked with
`eth_getCode` on 2026-09-08, see §2 of the design doc. Rehearsal is therefore a **fork of mainnet**,
where the real factory, the real curves and the real fee escrow are all present and our own contracts
are deployed fresh into fork state.

```bash
# Terminal 1. Without this, every fork test dies at "could not instantiate forked environment".
node scripts/rpc-proxy.mjs

# Terminal 2.
forge test -vv
```

Tests that need the fork **skip themselves** when the proxy is not running, rather than failing — so
`forge test` on its own still exercises everything that does not need a chain.

### Why the proxy

Robinhood Chain's public RPC sits behind Cloudflare, whose managed challenge fires on Foundry's
default User-Agent. `cast` can be talked round with `--rpc-headers`; `forge` cannot — it does not
take the flag, and `ETH_RPC_HEADERS` does not reach the fork backend. The proxy forwards each request
body verbatim with one header changed. It is not a trust boundary and must never become one: forge
signs locally, so what crosses it is an already-signed transaction, and no key ever does.

`rpc-proxy.mjs` is taken from [OpenPons](https://github.com/OpenPonsPro/OpenPons) (MIT), which found
the problem first.

## Deploying

Not yet. Mainnet deployment is gated on the user typing `deploy mainnet PONSFUND` in session — kit
rule 6 — and a constructor mistake here is permanent, since every address is `immutable`.

## Credit

Both contracts are shaped by [OpenPons](https://github.com/OpenPonsPro/OpenPons) (MIT), which worked
out the two facts everything here turns on: that `creatorFeeRecipient` is a launch parameter, and
that `sweepFees` only accepts the fee recipient. Pons V2's own source is at
[ponsdotdev/ponsfamily](https://github.com/ponsdotdev/ponsfamily) (MIT).
