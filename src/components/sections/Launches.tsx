import { useEffect, useMemo, useState } from "react";
import { ArrowUpRight, Search } from "lucide-react";
import { CHAINS, config } from "../../lib/config";
import { useChainLaunches } from "../../lib/launches";
import { fetchTokenStats, type TokenStats } from "../../lib/tokenStats";
import { formatPair } from "../../lib/marketCap";
import { tokenHref } from "../../lib/router";
import Section from "../ui/Section";

type Order = "trending" | "date" | "name";

const ORDERS: { key: Order; label: string; hint: string }[] = [
  { key: "trending", label: "Biggest", hint: "highest market cap on the curve" },
  { key: "date", label: "Newest", hint: "most recently launched first" },
  { key: "name", label: "Name", hint: "alphabetical" },
];

const compact = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });
const day = new Intl.DateTimeFormat("en", { day: "2-digit", month: "short", year: "numeric" });

/**
 * Every token launched through PonsFund, read from the chain.
 *
 * The rows come from `PonsFundLaunchpad`'s own on-chain register, read with one `eth_call` and one
 * multicall (`onchain.ts`): nothing here is a list someone maintains by hand, which is the point -- a
 * launchpad that curated its own table could quietly leave a launch out of it.
 *
 * ⚠ It used to read Clanker `TokenCreated` events out of Blockscout's log index, filtered by a JSON
 * tag. That is gone with Clanker itself. The register is not an optimisation: this chain caps
 * `eth_getLogs` at 2 000 blocks, roughly three minutes, so an event-scanned table could only ever
 * show the recent past.
 *
 * ⛔ The market column is a MARKET CAP READ OFF THE CURVE, not volume from the explorer. Blockscout
 * on this chain returns `volume_24h`, `exchange_rate` and `circulating_market_cap` as null for every
 * token -- verified cross-origin on 2026-09-08 -- because there is no price feed for it. The old
 * "Volume 24h" column could therefore never fill, and the "Trending" sort that read it could never
 * mean anything. `holders_count` DOES work, and is kept.
 *
 * A graduated launch shows a dash rather than a number: graduation drains the curve, so the
 * arithmetic would confidently price the token at zero. See `marketCap.ts`.
 */
export default function Launches() {
  const { items, loading } = useChainLaunches();
  const [stats, setStats] = useState<Record<string, TokenStats>>({});
  const [statsTried, setStatsTried] = useState(false);
  const [order, setOrder] = useState<Order>("date");
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (items.length === 0) return;
    let live = true;
    fetchTokenStats(items.map((i) => i.address)).then((next) => {
      if (!live) return;
      setStats(next);
      setStatsTried(true);
    });
    return () => {
      live = false;
    };
  }, [items]);

  // Sortable as soon as one launch is still on its curve. A board of only graduated tokens has no
  // market cap to sort by, and the control says so rather than silently ordering by something else.
  const trendingUsable = items.some((i) => i.marketCap != null);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? items.filter((i) => i.name.toLowerCase().includes(q) || i.symbol.toLowerCase().includes(q))
      : items.slice();
    /* Compared as bigints and only reduced to a number for the sign. A market cap in wei is well past
       2^53, so `Number(a) - Number(b)` loses the low bits and orders two close launches at random. */
    const cap = (v: bigint | null) => v ?? -1n;
    const sorters: Record<Order, (a: typeof items[number], b: typeof items[number]) => number> = {
      trending: (a, b) => {
        const d = cap(b.marketCap) - cap(a.marketCap);
        return d > 0n ? 1 : d < 0n ? -1 : (b.at ?? 0) - (a.at ?? 0);
      },
      date: (a, b) => (b.at ?? 0) - (a.at ?? 0),
      name: (a, b) => a.name.localeCompare(b.name),
    };
    return filtered.sort(sorters[trendingUsable || order !== "trending" ? order : "date"]);
  }, [items, query, order, trendingUsable]);

  const explorer = CHAINS[config.token.chain];
  const cell = "px-4 py-3 text-left align-middle";

  return (
    <Section
      id="launches"
      eyebrow="The board"
      title="Launched through PonsFund"
      subtitle={`Every token below was launched through the PonsFund contract, which keeps its own register on chain — so this table is read from ${explorer.label} rather than kept by hand, and a launch cannot be left out of it. Search it by name or ticker, and sort it by what is moving or by what is new.`}
    >
      <div className="panel p-5 md:p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <label className="pixel-frame flex w-full items-center gap-2.5 bg-bg/50 px-3.5 py-3 md:max-w-xs">
            <Search className="h-4 w-4 shrink-0 text-muted" />
            <input
              className="w-full bg-transparent font-mono text-sm text-fg outline-none placeholder:text-muted/70"
              value={query}
              placeholder="Search a name or ticker"
              aria-label="Search launches by name or ticker"
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>

          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Sort launches">
            {ORDERS.map((o) => {
              const disabled = o.key === "trending" && statsTried && !trendingUsable;
              const active = order === o.key && !disabled;
              return (
                <button
                  key={o.key}
                  type="button"
                  disabled={disabled}
                  title={disabled ? "Every launch here has graduated, so no curve prices one." : o.hint}
                  onClick={() => setOrder(o.key)}
                  aria-pressed={active}
                  className={`btn-pixel px-4 py-2.5 text-[12px] leading-none ${
                    active
                      ? "bg-accent text-bg"
                      : disabled
                        ? "pointer-events-none bg-fg/[0.06] text-muted opacity-50"
                        : "bg-accent3/[0.18] text-accent3"
                  }`}
                >
                  {o.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse">
            <thead>
              <tr className="border-b border-fg/15">
                {["Token", "Status", "Launched", "Holders", "Market cap", ""].map((h, i) => (
                  <th
                    key={h || i}
                    scope="col"
                    className={`${cell} label-pixel text-[11px] font-normal text-muted ${i > 2 ? "text-right" : ""}`}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const s = stats[row.address.toLowerCase()];
                return (
                  <tr key={row.address} className="border-b border-fg/10 last:border-0 hover:bg-fg/[0.04]">
                    <td className={cell}>
                      <div className="flex items-center gap-3">
                        {row.image ? (
                          <img src={row.image} alt="" className="pixel-img pixel-frame h-8 w-8 object-cover" />
                        ) : (
                          <span className="pixel-frame flex h-8 w-8 shrink-0 items-center justify-center bg-fg/10 font-mono text-[11px] text-muted">
                            {row.symbol.slice(0, 2)}
                          </span>
                        )}
                        <div className="leading-tight">
                          <div className="label-pixel text-[12px] text-fg">{row.name}</div>
                          <div className="font-mono text-[11px] text-muted">${row.symbol}</div>
                        </div>
                      </div>
                    </td>
                    <td className={`${cell} label-pixel text-[12px] ${row.graduated ? "text-accent2" : "text-accent"}`}>
                      {row.graduated ? "Graduated" : "On the curve"}
                    </td>
                    <td className={`${cell} font-mono text-[12px] text-muted`}>
                      {row.at ? day.format(new Date(row.at * 1000)) : "—"}
                    </td>
                    <td className={`${cell} text-right font-mono text-[12px] text-fg/90`}>
                      {s?.holders != null ? compact.format(s.holders) : "—"}
                    </td>
                    <td className={`${cell} text-right font-mono text-[12px] text-fg/90`}>
                      {row.marketCap != null
                        ? `${formatPair(row.marketCap, row.pairDecimals)} ${row.pairSymbol}`
                        : "—"}
                    </td>
                    <td className={`${cell} text-right`}>
                      {/* The token's own page on this site, not the raw explorer. A launchpad that
                          sends every click off to Blockscout tells the visitor nothing about the
                          treasury the launch pays into. The explorer link lives on that page. */}
                      <a
                        href={tokenHref(row.address)}
                        aria-label={`Open ${row.name}`}
                        className="pixel-frame inline-grid h-8 w-8 place-items-center text-accent3 transition hover:bg-accent3/15"
                      >
                        <ArrowUpRight className="h-4 w-4" />
                      </a>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {rows.length === 0 && (
          <div className="dialogue mt-5 flex items-center gap-3 px-4 py-3.5">
            <span className="label-pixel flex-1 text-[13px] leading-[1.5] text-fg">
              {loading
                ? `Reading ${explorer.explorerName}…`
                : items.length === 0
                  ? "No token has launched through PonsFund yet. Yours can be the first, just below."
                  : "Nothing here matches that search."}
            </span>
            <span aria-hidden className="caret shrink-0 text-accent2">
              &#9662;
            </span>
          </div>
        )}
      </div>
    </Section>
  );
}
