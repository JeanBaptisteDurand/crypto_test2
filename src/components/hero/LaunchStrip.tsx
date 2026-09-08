import { useEffect, useRef, useState } from "react";
import { config, derivedLinks } from "../../lib/config";
import { useLaunches } from "../../lib/launches";

/**
 * The scrolling strip at the bottom of the hero: the tokens that exist around this one
 * (platform launches, previous launches by the same team, partners). Visible before any scroll.
 * Items come from config.strip.items. Empty → the strip is not rendered.
 *
 * The loop: the track translates by -50%, so the second half must sit exactly where the first began.
 * Two conditions, and both have to hold:
 *   1. half the track is a whole number of copies — no flex `gap` and no padding inside the animated
 *      element, since both land inside the width being halved;
 *   2. one half is at least as wide as the viewport. This is the one that was missing: four tiles came to
 *      1067px, so on a 1440px screen the track ran out 373px before the loop point and the tiles seemed to
 *      appear from nowhere. How many copies that takes depends on the screen, so it is measured.
 */
export default function LaunchStrip() {
  const strip = config.strip;
  // Not `strip.items`: the tiles come from the config, from this visitor's drafts and from the chain.
  const items = useLaunches();
  const copyRef = useRef<HTMLDivElement>(null);
  const [reps, setReps] = useState(4);

  useEffect(() => {
    if (items.length === 0) return;
    const measure = () => {
      const w = copyRef.current?.getBoundingClientRect().width;
      if (!w) return;
      // +1 copy of headroom so the seam is never the last thing on screen
      const half = Math.max(1, Math.ceil(window.innerWidth / w) + 1);
      setReps(half * 2);
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
    // Re-measured when a draft or an on-chain launch changes the copy's width, not only its count.
  }, [items.length, items.map((i) => i.symbol).join(",")]);

  if (!strip || items.length === 0) return null;
  const links = derivedLinks();

  const statusLabel = (s?: string) => (s === "live" ? "Live" : s === "ended" ? "Ended" : "Scheduled");
  const statusClass = (s?: string) =>
    s === "live" ? "text-accent" : s === "ended" ? "text-muted line-through" : "text-muted";

  return (
    <div className="relative z-10 w-full border-t border-fg/10 bg-bg/70 backdrop-blur-sm">
      <div className="mx-auto flex max-w-6xl items-center gap-4 px-6 pt-4">
        <span className="label-pixel text-[12px] text-muted">{strip.title ?? "Launches"}</span>
      </div>
      <div
        className="marquee mt-3 pb-4"
        style={{ ["--marquee-duration" as string]: `${Math.max(24, items.length * reps * 1.6)}s` }}
      >
        <div className="marquee-track">
          {Array.from({ length: reps }, (_, copy) => (
            <div key={copy} ref={copy === 0 ? copyRef : undefined} className="marquee-copy" aria-hidden={copy > 0}>
              {items.map((it, i) => {
                const href = it.url ?? (i === 0 && copy === 0 ? links.website : null);
                const Tag = href ? "a" : "div";
                return (
                  <Tag
                    key={`${it.symbol}-${i}`}
                    {...(href ? { href, target: "_blank", rel: "noreferrer" } : {})}
                    className="glass flex shrink-0 items-center gap-3 px-4 py-3 transition hover:bg-accent3/[0.14]"
                  >
                    {it.image ? (
                      <img src={it.image} alt="" className="pixel-img pixel-frame h-8 w-8 object-cover" />
                    ) : (
                      // No logo yet: a monogram, never this token's mascot.
                      <span className="pixel-frame flex h-8 w-8 shrink-0 items-center justify-center bg-fg/10 font-pixel text-[10px] text-muted">
                        {it.symbol.slice(0, 2)}
                      </span>
                    )}
                    <div className="leading-tight">
                      <div className="flex items-baseline gap-2">
                        <span className="label-pixel text-[12px] text-fg">{it.name}</span>
                        <span className="font-mono text-[11px] text-muted">${it.symbol}</span>
                      </div>
                      <div
                        className={`label-pixel mt-1 text-[12px] ${
                          it.draft ? "text-accent3" : statusClass(it.status)
                        }`}
                      >
                        {/* A draft says so. It exists in this browser only, and the strip is the one place
                            it could be mistaken for a launch that happened. */}
                        {it.draft ? "Draft · only you see this" : statusLabel(it.status)}
                        {!it.draft && it.note ? ` · ${it.note}` : ""}
                      </div>
                    </div>
                  </Tag>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
