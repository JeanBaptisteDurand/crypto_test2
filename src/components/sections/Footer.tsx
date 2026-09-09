import { motion } from "motion/react";
import { BarChart3, Search, Send } from "lucide-react";
import { CHAINS, config, derivedLinks } from "../../lib/config";
import ShaderBackground from "../backgrounds/ShaderBackground";
import CopyAddress from "../ui/CopyAddress";

function XIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M18.244 2H21.5l-7.5 8.57L22.5 22h-6.9l-5.4-7.06L3.9 22H.64l8.02-9.17L.5 2h7.07l4.88 6.45L18.24 2Zm-1.21 18h1.8L7.05 3.9H5.12L17.03 20Z" />
    </svg>
  );
}

/**
 * The footer is the closing scene: the vault art seen through the same dither as the hero, so the page
 * ends where it started. Same preset, same transparency-step reveal, one image swapped -- the picture is
 * never fully hidden and never fully exposed.
 *
 * Everything a footer owes the reader lives inside it: the social links, the contract address and
 * the copyright. The lower half of the band fades to the page colour so all of that sits on a
 * readable ground while Keystone keeps the top half.
 *
 * ⚠ THE RISK DISCLAIMER WAS REMOVED ON THE OWNER'S EXPLICIT INSTRUCTION (2026-09-08). It said the
 * token has no intrinsic value, that the vault may hold nothing, that you can lose everything, and
 * that PonsFund is not affiliated with Robinhood. Kit rule 7 requires a disclaimer in the footer,
 * so this is a deliberate override of that rule and not an oversight -- do not re-add it without
 * asking, and do not remove this note, which is the only remaining trace of the decision.
 *
 * ⚠ A CC-BY-4.0 credit to Matt Harris stood here and was removed on 2026-09-09, because the owner
 * says the attribution is simply wrong -- the chest is not that model. Crediting someone who did not
 * make the asset is its own error, so the line went. BRIEF.md §"Le coffre 3D" still described the
 * Sketchfab provenance and is corrected to match; do not re-add the credit from that section.
 *
 * ⚠ If a third-party model is ever dropped into `assets/user/`, check its licence before shipping
 * it: this footer no longer carries an attribution slot, and a CC-BY asset would need one.
 */
export default function Footer() {
  const t = config.token;
  const l = derivedLinks();
  const links = [
    { href: l.x, label: "X / Twitter", icon: XIcon },
    { href: l.telegram, label: "Telegram", icon: Send },
    { href: l.dexscreener, label: "Dexscreener", icon: BarChart3 },
    { href: l.basescan, label: CHAINS[t.chain].explorerName, icon: Search },
  ].filter((x) => Boolean(x.href));

  return (
    <footer id="awaits" className="relative isolate overflow-hidden">
      <div className="absolute inset-0 -z-10">
        {/* The art is pre-cropped to this band's ratio (see public/sections/awaits.webp): the shader
            covers, so a square source came out with Keystone's head sliced off. */}
        <ShaderBackground
          preset="dither"
          palette={config.design.palette}
          // Drawn in chunks, so half the pixels cost nothing visible -- same call as the hero.
          scale={0.55}
          image="/sections/awaits.webp"
          // The aura sits right of centre, where the vault is in the frame; the preset darkens the
          // opposite side, which is the side the line sits on.
          focus={{ x: 0.62, y: 0.62 }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-24"
          style={{ background: "linear-gradient(to bottom, var(--bg), transparent)" }}
        />
        {/* The long fade: the footer's own text sits on it, so it reaches nearly half the band. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 h-[52%]"
          style={{ background: "linear-gradient(to top, var(--bg) 30%, transparent)" }}
        />
      </div>

      <div className="mx-auto flex min-h-[560px] max-w-6xl flex-col justify-between gap-16 px-6 pb-12 pt-28 md:min-h-[820px]">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          className="max-w-md"
        >
          <p className="label-pixel mb-4 flex items-center gap-2.5 text-[13px] text-accent2">
            <span aria-hidden className="inline-block h-2 w-2 bg-accent2" />
            Can&apos;t wait to see you all
          </p>
          <h2 className="font-pixel text-3xl leading-[1.25] text-fg md:text-5xl">
            Keystone awaits in his vault
          </h2>
          {/* ⚠ Was "The doors open with the first distribution. Everything that lands inside is split
              between holders, every N hours." The eighth and last instance of a promise no contract
              keeps -- see §7 of the design doc. What is true is that the destination is sealed at
              launch, which is the part worth saying anyway. */}
          <p className="mt-5 max-w-md text-base leading-relaxed text-fg/85">
            Every token launched here pays its whole creator fee into the vault, on terms sealed in
            the launch transaction. Nobody can point them anywhere else afterwards.
          </p>
        </motion.div>

        <div>
          <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
            <div>
              <div className="flex items-center gap-3">
                <span className="pixel-frame grid h-9 w-9 place-items-center bg-accent2/10">
                  <img src={t.image} alt="" className="pixel-img h-6 w-6 object-contain" />
                </span>
                <span className="label-pixel text-[14px] text-fg">{t.name}</span>
              </div>
              <ul className="mt-5 flex flex-wrap items-center gap-2">
                {links.map((x) => (
                  <li key={x.label}>
                    <a
                      href={x.href!}
                      target="_blank"
                      rel="noreferrer"
                      className="glass label-pixel flex items-center gap-2.5 px-3.5 py-2.5 text-[12px] text-accent3 transition hover:bg-accent3/15"
                    >
                      <x.icon className="h-4 w-4" />
                      {x.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
            <CopyAddress full />
          </div>

          <div aria-hidden className="pixel-rule my-8" />

          <div className="flex flex-col gap-6 md:flex-row md:justify-end">
            <div className="flex flex-col gap-3 text-[11px] leading-relaxed text-muted md:items-end md:text-right">
              <p>
                © {new Date().getFullYear()} {t.name}. Deployed on {CHAINS[t.chain].label}.
              </p>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
