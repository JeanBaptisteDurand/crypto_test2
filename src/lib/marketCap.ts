/**
 * A launch's market cap, computed from its bonding curve and denominated in its own pair asset.
 *
 * ## Why this exists at all
 *
 * The board used to carry a "Volume 24h" column fed from Blockscout. On Robinhood Chain that field
 * is **always null** — checked against a live token on 2026-09-08, cross-origin from this site's own
 * origin:
 *
 *   holders_count          "29"     ← works
 *   volume_24h             null
 *   exchange_rate          null
 *   circulating_market_cap null
 *
 * There is no price feed for this chain, so the column could never fill and the "Trending" sort that
 * read it could never mean anything. The curve, on the other hand, prices the token by construction.
 * That is the only real market number available here, and it is the one OpenPons uses too.
 *
 * ## ⭐⭐ THE ARITHMETIC, AND WHY IT IS THIS SHAPE
 *
 * Pons V2's curve is constant product, so spot price is `quoteReserve / tokenReserve` and the market
 * cap is that price times the whole supply. Written naively that is three floating-point divisions
 * over numbers well past 2^53. Written as one integer ratio it is exact:
 *
 *   cap (pair base units) = quoteReserve * totalSupply / tokenReserve
 *
 * ⭐ The token's own decimals CANCEL. `totalSupply` and `tokenReserve` are both in the token's base
 * units, so whatever that scale is, it divides out. Only the PAIR asset's decimals survive. Worth
 * stating, because the obvious version of this reads `decimals()` off the token and uses it — a read
 * that can fail, for a number that cannot matter.
 *
 * ## ⛔⛔ THE PAIR ASSET'S DECIMALS DO NOT CANCEL, AND USDG IS 6
 *
 * `Number(quoteReserve) / Number(tokenReserve)` is a price only when quote and token share a decimal
 * scale. Against USDG that ratio is out by 1e12, and it is out **silently**: the figure is plausible,
 * positive, and wrong by a trillion. The result here is in the pair's base units and must be
 * formatted with the pair's decimals, never the token's.
 *
 * ## ⚠⚠ THE PHANTOM RESERVE BELONGS IN THE PRICE
 *
 * `quoteReserve` includes the curve's phantom quote, which is virtual and not real money. Leaving it
 * in is correct here, because the curve genuinely prices against it: a launch with no buys has a
 * market cap equal to its phantom reserve, which is its opening valuation. It must be taken OUT of
 * anything describing liquidity or graduation progress, and this is not that.
 *
 * The arithmetic and all four warnings above are from OpenPons's `web/src/lib/marketCap.ts`
 * (github.com/OpenPonsPro/OpenPons, MIT), which worked them out first.
 */

export interface CurveState {
  /** Includes the phantom quote. In the PAIR asset's base units. */
  quoteReserve: bigint;
  /** Tokens still held by the curve, in the token's base units. */
  tokenReserve: bigint;
  /** In the token's base units. */
  totalSupply: bigint;
  graduated: boolean;
}

/**
 * Market cap in the pair asset's BASE units, or null when it cannot be known.
 *
 * ⛔⛔ NULL, NEVER ZERO. Graduating sweeps the curve and drains its reserves, so a graduated launch
 * asked this question would answer with a confident zero — a real number, in the right units, saying
 * the token is worthless. A dash is the honest rendering of "this moved to a Uniswap pool and the
 * curve can no longer price it".
 */
export function marketCapInPair(s: CurveState): bigint | null {
  if (s.graduated) return null;
  if (s.tokenReserve <= 0n || s.totalSupply <= 0n || s.quoteReserve <= 0n) return null;
  return (s.quoteReserve * s.totalSupply) / s.tokenReserve;
}

/**
 * Base units → a short human string, with the pair's decimals.
 *
 * Two significant-ish figures and a compact suffix: the board is a scan, not a ledger, and a figure
 * like `1.6841203 ETH` in a table column is noise pretending to be precision. The token page can be
 * more exact if it ever needs to be.
 */
export function formatPair(amount: bigint, decimals: number): string {
  const n = Number(amount) / 10 ** decimals;
  if (!Number.isFinite(n)) return "—";
  if (n === 0) return "0";
  if (n < 0.001) return "<0.001";
  if (n < 1) return n.toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
  if (n < 1000) return n.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
  return new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(n);
}
