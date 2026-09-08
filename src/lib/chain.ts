import { createPublicClient, defineChain, http, type Chain as ViemChain } from "viem";
import { CHAINS, config, platform } from "./config";

/**
 * The chain, the read client, and the addresses that describe Pons.
 *
 * ## Why this is a separate file from `pons.ts`
 *
 * `pons.ts` is the **write** path: it builds launch arguments and signs. It is loaded on demand,
 * when a visitor opens the launch form, because nobody who is only reading the page needs it.
 *
 * This file is the **read** path, and it cannot be lazy: `onchain.ts` reads the launch register on
 * page load to draw the board. Keeping the two in one module made `pons.ts` a static dependency of
 * the first paint, which defeated its own dynamic import -- Vite says so out loud:
 *
 *   "pons.ts is dynamically imported ... but also statically imported by onchain.ts,
 *    dynamic import will not move module into another chunk"
 *
 * ⚠ So viem's core IS in the first chunk, unavoidably, and no comment anywhere should claim
 * otherwise. What stays out of it is the launch path.
 */

/**
 * Robinhood Chain.
 *
 * ⚠ `rpc.robinhood.com` does not resolve. The working host is `rpc.mainnet.chain.robinhood.com`,
 * which is what `CHAINS.robinhood.rpc` carries.
 *
 * ⚠⚠ This chain makes a block roughly every 100 ms and its public RPC caps `eth_getLogs` at 2 000
 * blocks -- about three minutes of history. Nothing on this site reads a log for that reason.
 */
export const launchChain: ViemChain = defineChain({
  id: CHAINS[config.token.chain].id,
  name: CHAINS[config.token.chain].label,
  nativeCurrency: CHAINS[config.token.chain].currency,
  rpcUrls: { default: { http: [CHAINS[config.token.chain].rpc] } },
  blockExplorers: {
    default: { name: CHAINS[config.token.chain].explorerName, url: CHAINS[config.token.chain].explorer },
  },
  /* ⭐⭐ Multicall3 is deployed at the canonical address on Robinhood Chain. Declaring it lets viem
     collapse every independent `readContract` in a tick into ONE request, which is the difference
     between a launches board that appears and one that trickles in against a rate-limited RPC. */
  contracts: { multicall3: { address: "0xcA11bde05977b3631167028862bE2a173976CA11" } },
});

export const publicClient = createPublicClient({
  chain: launchChain,
  transport: http(CHAINS[config.token.chain].rpc),
  /* ⚠ `wait` is short on purpose. Batching collects calls made within the window, and a long window
     delays the first paint by exactly that much for no gain when the calls are already issued
     together in a `Promise.all`. */
  batch: { multicall: { batchSize: 1024, wait: 16 } },
});

/**
 * Pons V2, on Robinhood Chain. Protocol constants, not launch parameters -- which is why they are
 * here and not in `launch.config.json`: they describe the chain, and no launch changes them.
 *
 * Verified with `eth_getCode` on 2026-09-08:
 *   factory  0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e   24 177 bytes
 *   router   0xe33E9E479dF8802cb0866d5d05258bEc4cF62948    4 416 bytes
 *
 * Source: `github.com/ponsdotdev/ponsfamily` → `contractsV2/src/v2/` (MIT).
 *
 * ⚠ Blockscout shows the factory as a verified "StubContract" from 2023. That is a misleading
 * bytecode match on the explorer: the account holds 24 KB of dispatch code and its EIP-1967
 * implementation slot is zero, so it is neither a stub nor a proxy.
 */
export const PONS = {
  factory: "0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e",
  router: "0xe33E9E479dF8802cb0866d5d05258bEc4cF62948",
} as const;

/**
 * Native ETH, as Pons names it.
 *
 * ⛔⛔ THE ZERO ADDRESS IS A VALID PAIR ASSET HERE, and it is the default one. Do not run a pair
 * address through `isRealAddress` -- that helper treats zero as "not configured yet", which is the
 * right reading for a treasury and exactly the wrong one for this. Pons special-cases native inside
 * the factory, so `approvedPairTokens(0x0)` returns **false** while a native launch works fine.
 * Checked live on 2026-09-08.
 */
export const NATIVE_PAIR = "0x0000000000000000000000000000000000000000";

/** `PonsFundLaunchpad`, ours. Null until it is deployed. */
export const launchpadAddress = platform.launchpad ?? null;
