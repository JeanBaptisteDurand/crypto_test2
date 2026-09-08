import { useEffect, useState } from "react";
import { config } from "../../lib/config";

/**
 * Time left before the next payout, in the hero.
 * The vault pays on a fixed cycle, so the target is `vault.firstPayoutAt` until it passes, then every
 * `vault.cycleHours` after it. With no date set the component renders nothing rather than a fake clock.
 */
function nextPayout(now: number): number | null {
  const v = config.vault;
  if (!v?.firstPayoutAt) return null;
  const first = Date.parse(v.firstPayoutAt);
  if (Number.isNaN(first)) return null;
  const cycle = Math.max(1, v.cycleHours) * 3_600_000;
  if (now < first) return first;
  // Land on the next boundary, never on one already gone.
  return first + Math.ceil((now - first) / cycle) * cycle;
}

function parts(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return [
    { v: Math.floor(s / 86400), label: "days" },
    { v: Math.floor((s % 86400) / 3600), label: "hours" },
    { v: Math.floor((s % 3600) / 60), label: "min" },
    { v: s % 60, label: "sec" },
  ];
}

export default function Countdown({ className = "" }: { className?: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const target = nextPayout(now);
  if (target === null) return null;

  return (
    // Stacks under 640px: four units on one line overflow a phone.
    // The figures are in the mono face, not the pixel one: Pixelify Sans draws its 2 and its 8 as very
    // nearly the same glyph, and a clock at 17px is exactly where that becomes a misread. The cells and
    // the labels carry the arcade register instead.
    <div
      className={`glass inline-flex max-w-full flex-col items-start gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-4 sm:px-5 ${className}`}
    >
      <span className="label-pixel text-[12px] text-muted">Next giveaway</span>
      <div className="flex items-stretch gap-1.5" role="timer" aria-live="off">
        {parts(target - now).map((p) => (
          <div
            key={p.label}
            className="pixel-frame flex min-w-[46px] flex-col items-center gap-1 bg-bg/40 px-2 py-1.5"
          >
            <span className="font-mono text-base font-semibold leading-none tabular-nums text-accent2 sm:text-lg">
              {String(p.v).padStart(2, "0")}
            </span>
            <span className="label-pixel text-[12px] leading-none text-muted">{p.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
