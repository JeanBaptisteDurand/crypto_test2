import { useEffect, useState } from "react";
import { ArrowLeft, ExternalLink, LineChart } from "lucide-react";
import { CHAINS, config, gmgnTokenUrl, shortAddress } from "../lib/config";
import { useChainLaunches } from "../lib/launches";
import { formatPair } from "../lib/marketCap";
import { fetchTokenStats, type TokenStats } from "../lib/tokenStats";
import type { ChainLaunch } from "../lib/onchain";

/**
 * One launch, on its own page.
 *
 * ## Why a real page and not a panel
 *
 * Being shareable is the point. A launcher wants to post a link to their token; a buyer wants to
 * send one to a friend. A panel that opens in place has no URL, and a launchpad whose tokens cannot
 * be linked to is a launchpad nobody links to.
 *
 * ⚠ It costs an SPA fallback on the host. See the note in `lib/router.ts` and `public/_redirects`.
 *
 * ## Where the numbers come from
 *
 * Everything except the holder count is already in the board's own read — the register plus one
 * multicall (`onchain.ts`) — so opening a token costs nothing new when the visitor came from the
 * board. Arriving cold, the same read runs once and this page waits for it.
 *
 * ⛔ There is no "price" and no "volume" here, deliberately. Blockscout on this chain answers null
 * for `exchange_rate`, `volume_24h` and `circulating_market_cap` on every token, so any figure in
 * those shapes would have to be invented. The market cap shown is computed from the curve's own
 * reserves, and a graduated launch shows a dash rather than the zero the drained curve would imply.
 */
export default function TokenPage({ address }: { address: string }) {
  const { items, loading } = useChainLaunches();
  const [stats, setStats] = useState<TokenStats | null>(null);

  const token: ChainLaunch | undefined = items.find((i) => i.address.toLowerCase() === address.toLowerCase());

  useEffect(() => {
    if (!token) return;
    let live = true;
    fetchTokenStats([token.address]).then((all) => {
      if (live) setStats(all[token.address.toLowerCase()] ?? null);
    });
    return () => {
      live = false;
    };
  }, [token]);

  const chain = CHAINS[config.token.chain];
  const gmgn = gmgnTokenUrl(address);

  if (!token) {
    return (
      <Shell>
        <div className="dialogue flex items-center gap-3 px-4 py-3.5">
          <span className="label-pixel flex-1 text-[13px] leading-[1.5] text-fg">
            {loading
              ? "Reading the chain…"
              : "No launch at that address came through PonsFund. It may have been launched elsewhere."}
          </span>
          <span aria-hidden className="caret shrink-0 text-accent2">
            &#9662;
          </span>
        </div>
        <p className="mt-4 font-mono text-[12px] text-muted">{address}</p>
      </Shell>
    );
  }

  const rows: [string, React.ReactNode][] = [
    ["Token", <Addr key="t" a={token.address} kind="token" />],
    ["Bonding curve", <Addr key="c" a={token.curve} kind="address" />],
    ["Launched by", <Addr key="l" a={token.launcher} kind="address" />],
    ["Paired with", <span key="p">{token.pairSymbol || shortAddress(token.pairToken)}</span>],
    [
      "Launched",
      <span key="d">
        {token.at ? new Date(token.at * 1000).toLocaleString("en", { dateStyle: "medium", timeStyle: "short" }) : "—"}
      </span>,
    ],
  ];

  return (
    <Shell>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <div className="flex flex-1 flex-col gap-4">
          <div className="panel p-6">
            <div className="flex items-center gap-4">
              {token.image ? (
                <img src={token.image} alt="" className="pixel-img pixel-frame h-16 w-16 shrink-0 object-cover" />
              ) : (
                <span className="pixel-frame grid h-16 w-16 shrink-0 place-items-center bg-fg/10 font-mono text-sm text-muted">
                  {token.symbol.slice(0, 2)}
                </span>
              )}
              <div className="min-w-0">
                <h1 className="font-display text-3xl font-bold leading-tight text-fg">{token.name}</h1>
                <p className="mt-1 font-mono text-sm text-muted">${token.symbol}</p>
              </div>
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-2">
              <span
                className={`pixel-frame px-3 py-1.5 label-pixel text-[12px] ${
                  token.graduated ? "bg-accent2/15 text-accent2" : "bg-accent/15 text-accent"
                }`}
              >
                {token.graduated ? "Trading on the pool" : "On the curve"}
              </span>
              <span className="pixel-frame bg-accent/[0.10] px-3 py-1.5 label-pixel text-[12px] text-accent">
                100% of its creator fee to the vault
              </span>
            </div>
          </div>

          <div className="panel p-6">
            <p className="label-pixel text-[13px] text-fg">On chain</p>
            <dl className="mt-4 flex flex-col gap-3">
              {rows.map(([k, v]) => (
                <div key={k} className="flex items-baseline justify-between gap-4">
                  <dt className="label-pixel text-[12px] text-muted">{k}</dt>
                  <dd className="text-right font-mono text-[12px] text-fg">{v}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>

        <div className="flex w-full flex-col gap-4 lg:w-[340px] lg:shrink-0">
          <Tile
            label="Market cap"
            value={token.marketCap != null ? `${formatPair(token.marketCap, token.pairDecimals)} ${token.pairSymbol}` : "—"}
            note={
              token.graduated
                ? "Graduation drains the curve, so it can no longer price the token. The pool does."
                : "Priced by the bonding curve, in the asset the launch is paired with."
            }
          />
          <Tile
            label="Holders"
            value={stats?.holders != null ? String(stats.holders) : "—"}
            note={`Counted by ${chain.explorerName}.`}
          />
          <Tile
            label="Creator fee"
            value="100%"
            note="To the PonsFund treasury, written into this launch and with no setter afterwards."
          />

          {/* ⭐ The chart comes FIRST and in the accent, the explorer second and quieter. Somebody
              who opened a token page wants to see what it is doing far more often than they want to
              read its bytecode, and gmgn is where the chart and the trading actually are.

              ⚠ Rendered only when the chain has a gmgn slug (`config.gmgnTokenUrl` returns null
              otherwise), so a chain gmgn does not cover shows no button rather than a dead one. */}
          {gmgn && (
            <a
              href={gmgn}
              target="_blank"
              rel="noreferrer"
              className="btn-pixel inline-flex items-center justify-center gap-2.5 bg-accent px-5 py-3.5 text-[12px] leading-none text-bg"
            >
              <LineChart className="h-4 w-4" />
              Chart on GMGN
            </a>
          )}
          <a
            href={`${chain.explorer}/token/${token.address}`}
            target="_blank"
            rel="noreferrer"
            className="btn-pixel inline-flex items-center justify-center gap-2.5 bg-accent3/[0.18] px-5 py-3 text-[12px] leading-none text-accent3"
          >
            <ExternalLink className="h-4 w-4" />
            Open on {chain.explorerName}
          </a>
        </div>
      </div>
    </Shell>
  );
}

function Tile({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="panel p-5">
      <p className="label-pixel text-[12px] text-muted">{label}</p>
      <p className="mt-3 font-display text-2xl font-bold leading-snug text-accent2">{value}</p>
      <p className="mt-2.5 text-[13px] leading-relaxed text-muted">{note}</p>
    </div>
  );
}

function Addr({ a, kind }: { a: string; kind: "token" | "address" }) {
  const chain = CHAINS[config.token.chain];
  return (
    <a
      href={`${chain.explorer}/${kind}/${a}`}
      target="_blank"
      rel="noreferrer"
      className="text-accent3 hover:underline"
    >
      {shortAddress(a)}
    </a>
  );
}

/**
 * The page frame. Kept here so the two states above cannot drift apart.
 *
 * ⚠ `pt-28` clears the sticky navbar. Without it the back link renders underneath it and is both
 * unreadable and unclickable -- the home page never hits this because its hero starts under the bar
 * by design, so it is only a page that begins with content that needs the offset.
 */
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto w-full max-w-5xl px-5 pb-10 pt-28 md:px-8 md:pb-14 md:pt-32">
      {/* A real link, so it is middle-clickable and the router turns it into navigation. */}
      <a href="/" className="label-pixel inline-flex items-center gap-2 text-[12px] text-accent3 hover:underline">
        <ArrowLeft className="h-4 w-4" />
        The board
      </a>
      <div className="mt-6">{children}</div>
    </main>
  );
}
