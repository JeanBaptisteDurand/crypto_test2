# PonsFund

The PonsFund launchpad: a site that launches tokens on **Pons V2** (Robinhood Chain) whose whole
creator-side swap fee is routed to one treasury, on terms written into the launch transaction.

Deployed on Railway. The contracts are in `contracts/` and are deployed with Foundry, not by Railway.

## ⛔⛔ THE ORDER MATTERS, AND IT IS NOT THE OBVIOUS ONE

`launch.config.json` is a **JavaScript import** (`src/lib/config.ts` line 1), so every address in it
is compiled **into the JS bundle** at build time. It is not read at runtime and there is no
environment variable for it.

So deploying the site first and the contracts second does not work: the site keeps the `null`
launchpad address that was frozen into its bundle, and the launch form goes on saying
*"The PonsFund launchpad is not deployed yet"* no matter what is live on chain.

```
1.  cd contracts && forge script script/Deploy.s.sol --rpc-url … --broadcast
        → prints PonsFundTreasury and PonsFundLaunchpad addresses

2.  launch.config.json:
        platform.launchpad  = <PonsFundLaunchpad address>
        vault.address       = <the wallet fees end up in>

3.  npm run build          ← the addresses enter the bundle here

4.  push to Railway
```

Deploying the site before the contracts is fine as a coming-soon page — it renders correctly and the
form refuses honestly. It just means a second build and deploy afterwards.

## Stack

Vite + React + TypeScript + Tailwind v4, viem for the chain, three/R3F for the hero's 3D chest.
Wallet is the injected provider only (`window.ethereum`) — no WalletConnect, so no project id and no
relay.

Everything the site shows about a launch is read from chain: the launch register on
`PonsFundLaunchpad`, the token's own on-chain metadata, and the bonding curve's reserves. The only
off-chain call is the holder count, from Blockscout.

## Deploy (Railway)

Push to the connected repo. Nixpacks runs `npm run build`, then `npm run start`.

⚠⚠ **`npm run start` is `serve -s dist`, and the `-s` is load-bearing.** It is what makes
`/token/0x…` resolve on a refresh or a shared link. `public/_redirects` does the same job on
Cloudflare Pages and is **ignored by Railway** — two hosts, two mechanisms, both present so that
whichever is used the other is inert rather than wrong. Drop the `-s` and every token link 404s.

No environment variables are needed.

## Develop

```bash
npm install
npm run dev
```

## Contracts

```bash
cd contracts
forge install foundry-rs/forge-std --no-git
forge install OpenZeppelin/openzeppelin-contracts --no-git

# Fork tests need the loopback proxy: Cloudflare 403s Foundry's User-Agent, and forge takes no
# header flag. They skip themselves without it rather than failing.
node scripts/rpc-proxy.mjs &
forge test
```

Two contracts, neither with an owner, a setter or a withdrawal path:

| | |
| --- | --- |
| `PonsFundTreasury` | The `creatorFeeRecipient` of every launch. Forwards 100% to one immutable address, and exposes `sweepFees`/`claim` as passthroughs anyone can call. |
| `PonsFundLaunchpad` | One transaction: launches on Pons V2 with the treasury named as fee recipient, and appends to an on-chain register. |

⛔ **The treasury exists because of one line in Pons**: `sweepFees` reverts
`NotFeeSweepOperator()` for everyone except Pons's operator and the launch's fee recipient. Naming a
plain wallet as recipient would mean only the holder of that private key could ever move a launch's
fees — two signed transactions per launch, forever. A contract as recipient makes the whole path
crankable by a stranger, into the same wallet.

⚠ Every constructor argument is `immutable`. A mistake is permanent. Deploy against a fork first.

`DESIGN.md` is the full design record, including what was verified on chain and what is still open.

## What is not done yet

- `$PONSFUND` itself is not launched — `token.contractAddress` is null and the site shows
  "Coming soon".
- The hero's countdown still counts down to a distribution that no contract performs.
- `og:title` and `og:description` are empty in the built HTML and filled at runtime by JS, so shared
  links preview without a title. Fixing it needs prerendering or an edge function.
