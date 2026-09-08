# PonsFund

The PonsFund launchpad: a site that launches tokens on **Pons V2** (Robinhood Chain) whose whole
creator-side swap fee is routed to one treasury, on terms written into the launch transaction.

Deployed on Railway. The contracts are in `contracts/` and are deployed with Foundry, not by Railway.

## Live on Robinhood Chain mainnet

| | |
| --- | --- |
| `PonsFundTreasury` | [`0x2Bc9D7eCF8D687eCeB92E7d94FD74a89F128A61C`](https://robinhoodchain.blockscout.com/address/0x2Bc9D7eCF8D687eCeB92E7d94FD74a89F128A61C) |
| `PonsFundLaunchpad` | [`0xa9feA715EcDD7D3453D8087d60FfD791d809b20e`](https://robinhoodchain.blockscout.com/address/0xa9feA715EcDD7D3453D8087d60FfD791d809b20e) |
| Fees end up at | `0x1C15359670c201812D4AE652BB0A232Ab70D9308` |

Both are in `launch.config.json`, so this build launches real tokens. Deployed 2026-09-08; the cost
was 0.000401 ETH.

⛔ `owner()`, `setRecipient`, `transferOwnership`, `withdraw`, `pause` and `execute` all revert on
both contracts on chain. No key can move the fee destination — including the one that deployed them.

**What a launch actually earns:** 0.70% of trading volume, measured on a fork
(`contracts/test/FeeShare.t.sol`), not estimated. Pons charges 1% per swap and keeps 30% of it. So
100% of the creator side reaches the wallet, and the creator side is 0.70%.

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

Point a Railway service at this repo. Nixpacks reads `railway.json`, runs `npm run build`, then
`npm run start`.

⚠⚠ **`npm run start` is `serve -s dist`, and the `-s` is load-bearing.** It is what makes
`/token/0x…` resolve on a refresh or a shared link. `public/_redirects` does the same job on
Cloudflare Pages and is **ignored by Railway** — two hosts, two mechanisms, both present so that
whichever is used the other is inert rather than wrong. Drop the `-s` and every token link 404s.

### ⛔⛔ Attach a Volume before accepting a single upload

The service stores token logos on disk. **Railway's container filesystem is ephemeral** — every
redeploy starts from the image and anything written at runtime is gone.

A token's logo URL is written into its constructor and **there is no setter**. If the file behind it
disappears, that token is imageless forever, on this site and on gmgn, and nothing can repair it.

In the Railway service: **Volumes → Add Volume → mount path `/data`**.

The server refuses to advertise uploads when the directory is not writable, so a missing volume
shows up as "no upload available" — a plain URL field instead of a drop zone — rather than as tokens
whose images quietly vanish next week.

### Environment variables

| | | |
| --- | --- | --- |
| `SITE_URL` | **set this** | `https://www.ponsfund.tech`. The public origin. |
| `LOGO_DIR` | optional | Where logos are stored. Defaults to `/data/logos`, which is the volume mount above. |
| `PORT` | injected | Railway sets it. |

⛔ `SITE_URL` is not cosmetic. It is the origin baked into every uploaded logo's URL **and written on
chain**. Left unset, the server falls back to `RAILWAY_PUBLIC_DOMAIN` — and a launch made while the
site was on a `*.up.railway.app` preview domain keeps that URL forever, even after the custom domain
is attached. Set it before the first launch, not after.

Without either, uploads are refused outright rather than minting a link the server cannot promise.

### The logo upload

`POST /api/logo` stores an image and returns an absolute URL on this domain; `GET /api/logo` is the
probe the form uses to decide whether to draw a drop zone at all.

⚠⚠ The probe **reads the JSON body, not the status code**. On a host where this server is not
running, `/api/logo` falls through to the SPA rule and answers 200 with the home page's HTML — a
client trusting the status would show a drop zone that cannot work. (Credit to OpenPons, whose
`upload.ts` flags exactly this trap; ours is modelled on it.)

⛔ **SVG is refused, on purpose.** An SVG is a document that can carry `<script>`, served from our own
origin — stored XSS against everyone who opens a token page. The type is sniffed from the file's own
magic bytes, never from the `Content-Type` header, which the uploader writes.

Files are content-addressed (sha256), so the same image twice is one file and nothing a caller sends
becomes part of a path.

### Why the build has a third step

`npm run build` ends with `node scripts/bake-meta.mjs`. The app fills the title and Open Graph tags
at runtime from the config, and **crawlers do not run JavaScript** — so without that step X,
Telegram and Discord all read `<title></title>` and every shared link previews as a blank card. That
matters most for `/token/0x…` pages, since being shareable is the whole reason they are real URLs.

⚠ It bakes ONE card for the whole site. A per-token preview needs HTML generated per request, which
means a small server ahead of `serve`. Not done, and not pretended.

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
- Link previews carry ONE card for the whole site. A per-token preview needs HTML generated per
  request; `server.mjs` is the natural place, but it is not done.
- Uploaded logos are never garbage-collected. An image uploaded by someone who then abandoned the
  form stays on the volume forever.
