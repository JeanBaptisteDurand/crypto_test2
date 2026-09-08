import { config } from "../../lib/config";
import Section from "../ui/Section";

function formatSupply(s: string) {
  const n = Number(s);
  if (!Number.isFinite(n)) return s;
  if (n >= 1e12) return `${(n / 1e12).toFixed(n % 1e12 ? 1 : 0)}T`;
  if (n >= 1e9) return `${(n / 1e9).toFixed(n % 1e9 ? 1 : 0)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(n % 1e6 ? 1 : 0)}M`;
  return n.toLocaleString();
}

const CELLS = 20;

/**
 * The supply as a set of gauges rather than a donut. In this idiom a share is a bar of cells you can
 * count, and cells survive the reading a donut arc does not: 100% is a full bar, and a 10% slice is two
 * cells, visible at a glance. Colours alternate accent / accent2 / muted like the old donut did.
 */
export default function Tokenomics() {
  const items = config.tokenomics;
  const colors = ["var(--accent2)", "var(--accent)", "var(--muted)", "var(--fg)"];

  return (
    <Section
      id="tokenomics"
      eyebrow="Tokenomics"
      title="Simple by design"
      subtitle={`Total supply ${formatSupply(config.token.totalSupply)} $${config.token.symbol}. Fixed forever.`}
    >
      <div className="grid items-start gap-4 md:grid-cols-[minmax(0,0.85fr)_minmax(0,1.6fr)]">
        <div className="panel flex flex-col items-center justify-center gap-2 p-7">
          <span className="label-pixel text-[12px] text-muted">Total supply</span>
          {/* Display face, not pixel: Pixelify's B is its 8, so "100B" read as "1008". */}
          <span className="font-display text-4xl font-extrabold text-accent2">
            {formatSupply(config.token.totalSupply)}
          </span>
          <span className="label-pixel text-[12px] text-fg/70">${config.token.symbol}</span>
          <span className="mt-3 label-pixel text-[12px] text-muted">Fixed forever</span>
        </div>

        <ul className="flex flex-col gap-4">
          {items.map((it, i) => {
            const color = colors[i % colors.length];
            const filled = Math.max(1, Math.round((it.percent / 100) * CELLS));
            return (
              <li key={it.label} className="panel p-5">
                <div className="flex items-center justify-between gap-4">
                  <span className="label-pixel text-[12px] text-fg">{it.label}</span>
                  <span className="font-pixel text-2xl" style={{ color }}>
                    {it.percent}%
                  </span>
                </div>
                <div className="hp-bar mt-4" role="img" aria-label={`${it.percent} percent`}>
                  {Array.from({ length: CELLS }, (_, c) => (
                    <span
                      key={c}
                      className="hp-cell"
                      style={c < filled ? { background: color } : undefined}
                    />
                  ))}
                </div>
                {it.note && <p className="mt-4 text-sm text-muted">{it.note}</p>}
              </li>
            );
          })}
        </ul>
      </div>
    </Section>
  );
}
