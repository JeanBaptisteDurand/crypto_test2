import { CHAINS, config } from "./config";

/**
 * Holder count and 24h volume per token, from the explorer.
 *
 * This is what makes the launches table's "Trending" order mean something: without it the only orders
 * available are the ones the event log already gives (date, name), and a column labelled "trending" that
 * sorted by date would be a lie. Blockscout serves both numbers on `/api/v2/tokens/{address}`.
 *
 * Best effort, always: one request per token, all of them allowed to fail independently, the whole thing
 * capped and cached for the session. A token with no stats sorts last under Trending and shows a dash.
 */

export interface TokenStats {
  holders: number | null;
  volume24h: number | null;
}

const CACHE_KEY = "ponsfund:token-stats";
const CACHE_TTL = 5 * 60 * 1000;
/** Enough for a launchpad's front page, few enough that opening it is not a burst of 200 requests. */
const MAX_TOKENS = 40;
/** A table column is not worth a request that hangs. */
const TIMEOUT = 8_000;

const num = (v: unknown): number | null => {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : null;
};

async function fetchOne(explorer: string, address: string): Promise<[string, TokenStats] | null> {
  try {
    const res = await fetch(`${explorer}/api/v2/tokens/${address}`, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(TIMEOUT),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as Record<string, unknown>;
    return [
      address.toLowerCase(),
      // Blockscout renamed `holders` to `holders_count` along the way; both spellings are in the wild.
      { holders: num(body.holders_count) ?? num(body.holders), volume24h: num(body.volume_24h) },
    ];
  } catch {
    return null;
  }
}

export async function fetchTokenStats(addresses: string[]): Promise<Record<string, TokenStats>> {
  const explorer = CHAINS[config.token.chain];
  if (explorer.explorerName !== "Blockscout" || addresses.length === 0) return {};

  const wanted = addresses.slice(0, MAX_TOKENS).map((a) => a.toLowerCase());
  const cached = readCache();
  const missing = wanted.filter((a) => !(a in cached));
  if (missing.length === 0) return cached;

  const settled = await Promise.all(missing.map((a) => fetchOne(explorer.explorer, a)));
  const merged = { ...cached };
  for (const entry of settled) if (entry) merged[entry[0]] = entry[1];
  writeCache(merged);
  return merged;
}

function readCache(): Record<string, TokenStats> {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return {};
    const { at, stats } = JSON.parse(raw) as { at: number; stats: Record<string, TokenStats> };
    return Date.now() - at < CACHE_TTL ? stats : {};
  } catch {
    return {};
  }
}
function writeCache(stats: Record<string, TokenStats>) {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), stats }));
  } catch {
    /* private mode, quota: the numbers are fetched again next load */
  }
}
