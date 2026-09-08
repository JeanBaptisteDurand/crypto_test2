import { parseAbi } from "viem";
import { CHAINS, config, pairDecimalsAt, pairSymbolAt, type StripItem } from "./config";
import { marketCapInPair } from "./marketCap";
import { PONS, launchpadAddress, publicClient } from "./chain";

/**
 * The launches, read from the chain.
 *
 * ## ⛔⛔ WHY THIS IS AN ARRAY READ AND NOT AN EVENT SCAN
 *
 * The obvious way to list what a launchpad has launched is to scan its events. On Robinhood Chain
 * that does not work. The chain produces a block roughly every 100 ms and the public RPC caps
 * `eth_getLogs` at 2 000 blocks -- **about three minutes of history**. A feed built on events would
 * show the last three minutes and present it as the archive.
 *
 * So `PonsFundLaunchpad` keeps its own array, and this reads it with `eth_call`. Multicall3 is
 * deployed at the canonical address on this chain and is declared on the client in `chain.ts`, so the
 * per-token metadata reads collapse into one request instead of three per launch.
 *
 * ## What this replaced
 *
 * Until Pons V2, this file queried Blockscout's etherscan-compatible log index for Clanker
 * `TokenCreated` events and filtered them by a JSON tag in the event data, narrowed by
 * `platform.launchesFromBlock` because the unfiltered query was 2.4 MB. All of that is gone: our own
 * register is authoritative, needs no explorer, no index, no floor block and no tag parsing, and it
 * works on any chain rather than only the ones with a Blockscout.
 *
 * Every failure path still returns `[]` rather than throwing. The strip is decoration on a page that
 * has to render, and the launches table has an empty state for the same reason.
 */

const CACHE_KEY = "ponsfund:chain-launches";
const CACHE_TTL = 5 * 60 * 1000;
/** How many of the newest launches the board shows. The register can hold more. */
const PAGE = 48;

const LAUNCHPAD_ABI = parseAbi([
  "struct Launch { address token; address curve; address launcher; address pairToken; uint64 at; }",
  "function latest(uint256 offset, uint256 limit) view returns (Launch[])",
  "function launchCount() view returns (uint256)",
]);

/**
 * The metadata a Pons token carries on chain.
 *
 * `logo` and `description` are public strings on `PonsV2LauncherToken`, so they have getters. There
 * is no off-chain fetch anywhere in this file: what the token says about itself is what is shown.
 */
const TOKEN_ABI = parseAbi([
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function logo() view returns (string)",
  "function totalSupply() view returns (uint256)",
]);

/** The curve prices the token. `getReserves` is the only market data this chain actually has. */
const CURVE_ABI = parseAbi([
  "function getReserves() view returns (uint256 quoteReserve, uint256 tokenReserve)",
]);

/**
 * Pons's record for a launch. Only `phase` is read: it is how graduation is known, and a graduated
 * curve has drained reserves that would otherwise price the token at zero.
 *
 * ⚠ `phase` is 2 once graduated -- confirmed against OpenPons's own live token, which the site shows
 * as "Graduated" and whose record reads 2.
 */
const FACTORY_ABI = parseAbi([
  "struct LaunchedToken { address token; address curve; address deployer; address creatorFeeRecipient; address pairToken; uint256 graduationThreshold; uint24 poolFee; int24 tickSpacing; uint16 creatorTaxBps; bool buybackEnabled; uint8 phase; uint256 sweptQuote; uint256 sweptTokens; uint256 sweptAt; bool exists; }",
  "function getLaunchedToken(address token) view returns (LaunchedToken)",
]);

const GRADUATED_PHASE = 2;

/** A launch as the chain describes it: enough for the strip tile and for a row of the launches table. */
export interface ChainLaunch extends StripItem {
  address: string;
  /** Unix seconds, from the register. Always present, unlike the explorer timestamp it replaced. */
  at: number | null;
  /** The curve that prices it, and the wallet that launched it. Both from our register. */
  curve: string;
  launcher: string;
  /** The asset the curve is denominated in, with the two things needed to render an amount in it. */
  pairToken: string;
  pairSymbol: string;
  pairDecimals: number;
  /**
   * Market cap in the PAIR asset's base units, or null.
   *
   * ⛔ Null for a graduated launch, and that is not a failure: graduation drains the curve, so the
   * arithmetic would return a confident zero. See `marketCap.ts`.
   */
  marketCap: bigint | null;
  graduated: boolean;
}

/**
 * Tokens launched through this site, newest first.
 *
 * Returns `[]` while `platform.launchpad` is null -- before the launchpad is deployed there is
 * nothing to read, and the board falls back to whatever the config lists.
 */
export async function fetchChainLaunches(): Promise<ChainLaunch[]> {
  if (!launchpadAddress) return [];

  const cached = readCache();
  if (cached) return cached;

  const explorer = CHAINS[config.token.chain].explorer;

  try {
    // `latest` already returns newest first, so no reversing here -- the ordering is the contract's,
    // where it costs nothing, rather than the browser's.
    const page = await publicClient.readContract({
      address: launchpadAddress as `0x${string}`,
      abi: LAUNCHPAD_ABI,
      functionName: "latest",
      args: [0n, BigInt(PAGE)],
    });
    if (page.length === 0) {
      writeCache([]);
      return [];
    }

    /* ONE multicall for everything, six reads per launch. Without the multicall3 declaration on the
       client this is 6n round trips against a rate-limited public RPC; with it, one request.

       ⚠ `allowFailure`, so a single odd token cannot blank the whole board. A launch whose name or
       symbol will not read is dropped; one whose reserves will not read still renders, with a dash
       where its market cap would be. */
    const reads = await publicClient.multicall({
      contracts: page.flatMap((l) => [
        { address: l.token, abi: TOKEN_ABI, functionName: "name" } as const,
        { address: l.token, abi: TOKEN_ABI, functionName: "symbol" } as const,
        { address: l.token, abi: TOKEN_ABI, functionName: "logo" } as const,
        { address: l.token, abi: TOKEN_ABI, functionName: "totalSupply" } as const,
        { address: l.curve, abi: CURVE_ABI, functionName: "getReserves" } as const,
        { address: PONS.factory, abi: FACTORY_ABI, functionName: "getLaunchedToken", args: [l.token] } as const,
      ]),
      allowFailure: true,
    });

    const items: ChainLaunch[] = [];
    page.forEach((l, i) => {
      const at = (k: number) => reads[i * 6 + k]?.result;
      const name = str(at(0));
      const symbol = str(at(1));
      // A token whose name or symbol will not read is not rendered: a blank tile on a board of
      // launches says less than no tile, and it is the shape a wrong address produces.
      if (!name || !symbol) return;

      const logo = str(at(2));
      const totalSupply = big(at(3));
      const reserves = at(4) as readonly [bigint, bigint] | undefined;
      const record = at(5) as { phase?: number } | undefined;
      const graduated = Number(record?.phase ?? 0) >= GRADUATED_PHASE;

      const marketCap =
        totalSupply !== null && reserves
          ? marketCapInPair({
              quoteReserve: reserves[0],
              tokenReserve: reserves[1],
              totalSupply,
              graduated,
            })
          : null;

      items.push({
        name,
        symbol,
        status: "live",
        note: graduated ? "graduated, paying into the treasury" : "paying into the treasury",
        url: `${explorer}/token/${l.token}`,
        address: l.token,
        at: Number(l.at) || null,
        curve: l.curve,
        launcher: l.launcher,
        pairToken: l.pairToken,
        pairSymbol: pairSymbolAt(l.pairToken),
        pairDecimals: pairDecimalsAt(l.pairToken),
        marketCap,
        graduated,
        /* ⚠ https only. This string is written by whoever launched the token, so `ipfs://` would
           not load and a `data:` URL would be a way to put arbitrary bytes in the hero. */
        image: logo.startsWith("https://") ? logo : null,
      });
    });

    writeCache(items);
    return items;
  } catch {
    return [];
  }
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim().slice(0, 64) : "";
}

function big(v: unknown): bigint | null {
  return typeof v === "bigint" ? v : null;
}

/** How many launches the register holds, for the counter above the board. */
export async function fetchLaunchCount(): Promise<number | null> {
  if (!launchpadAddress) return null;
  try {
    const n = await publicClient.readContract({
      address: launchpadAddress as `0x${string}`,
      abi: LAUNCHPAD_ABI,
      functionName: "launchCount",
    });
    return Number(n);
  } catch {
    return null;
  }
}

/*
  ⛔⛔ `marketCap` IS A BIGINT AND `JSON.stringify` THROWS ON ONE.

  Not "serialises it oddly" -- it raises `TypeError: Do not know how to serialize a BigInt`. The write
  below is wrapped in a try/catch for private mode and quota, so that throw would have been swallowed
  and the session cache would simply have stopped existing: every page load paying for the multicall
  again, with nothing anywhere saying why. It is converted to a decimal string on the way out and
  back to a bigint on the way in.
*/
type CachedLaunch = Omit<ChainLaunch, "marketCap"> & { marketCap: string | null };

function readCache(): ChainLaunch[] | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const { at, items } = JSON.parse(raw) as { at: number; items: CachedLaunch[] };
    if (Date.now() - at >= CACHE_TTL) return null;
    return items.map((i) => ({ ...i, marketCap: i.marketCap == null ? null : BigInt(i.marketCap) }));
  } catch {
    return null;
  }
}

function writeCache(items: ChainLaunch[]) {
  try {
    const plain: CachedLaunch[] = items.map((i) => ({
      ...i,
      marketCap: i.marketCap == null ? null : i.marketCap.toString(),
    }));
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), items: plain }));
  } catch {
    /* private mode, quota: the query just runs again next load */
  }
}

/**
 * One request for the whole page.
 *
 * Three things read this list -- the strip in the hero, the launches table and the launch form -- and
 * the session cache only starts helping once the first answer is back, so without this they would
 * each ask the chain at the same moment and collect a rate limit between them.
 */
let inflight: Promise<ChainLaunch[]> | null = null;
const listeners = new Set<() => void>();

export function loadChainLaunches(): Promise<ChainLaunch[]> {
  // A rejection is impossible (every failure path returns []), so the promise is kept as the answer.
  inflight ??= fetchChainLaunches();
  return inflight;
}

/** Drop the cache and tell everyone reading it, so a token just launched appears without a reload. */
export function invalidateChainLaunches() {
  try {
    sessionStorage.removeItem(CACHE_KEY);
  } catch {
    /* nothing to drop */
  }
  inflight = null;
  for (const fn of listeners) fn();
}

export function subscribeChainLaunches(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
