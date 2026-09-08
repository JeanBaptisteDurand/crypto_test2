import { Suspense, lazy, useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { ArrowRight, Send, Sparkles } from "lucide-react";
import { CHAINS, buyLink, config, derivedLinks, isLive } from "../lib/config";
import Background from "./backgrounds/Background";
import Button from "./ui/Button";
import LaunchStrip from "./hero/LaunchStrip";
import Countdown from "./hero/Countdown";
import { openCreateForm } from "../lib/openCreate";

// three.js arrives after the text has painted.
const TokenScene = lazy(() => import("./hero/TokenScene"));

const ease = [0.22, 1, 0.36, 1] as const;

function XIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M18.244 2H21.5l-7.5 8.57L22.5 22h-6.9l-5.4-7.06L3.9 22H.64l8.02-9.17L.5 2h7.07l4.88 6.45L18.24 2Zm-1.21 18h1.8L7.05 3.9H5.12L17.03 20Z" />
    </svg>
  );
}

/** "PonsFund" -> ["Pons", "Fund"] so the first half can carry the gold. One word stays whole. */
function splitDisplayName(name: string): [string, string] {
  const m = name.match(/^([A-Z][a-z0-9]*)([A-Z].*)$/);
  return m ? [m[1], m[2]] : [name, ""];
}

/**
 * Hero = the only part of the page built first (see /build-hero).
 * Default composition "editorial-3d": text on the left, 3D token mascot on the right, launches strip at the
 * bottom, all visible before any scroll. Other compositions: "centered" (stack), "editorial" (text left, no
 * visual), "split-image" (text left, assets.heroImage right). Set in launch.config.json → hero.composition.
 * /build-hero may restyle anything here but must keep <Background /> first and <LaunchStrip /> last.
 */
export default function Hero() {
  const [sceneReady, setSceneReady] = useState(false);
  // Where the 3D column actually is, so the background can put its aura on the chest. Measured from the
  // layout and re-measured on resize: the page is a centred max-width container, so this fraction is not
  // the same at 1440px and at 2560px.
  const visualRef = useRef<HTMLDivElement>(null);
  const sectionRef = useRef<HTMLElement>(null);
  const [focus, setFocus] = useState<{ x: number; y: number } | undefined>(undefined);
  useEffect(() => {
    const measure = () => {
      const el = visualRef.current;
      const host = sectionRef.current;
      if (!el || !host) return;
      const r = el.getBoundingClientRect();
      const h = host.getBoundingClientRect();
      if (!h.width || !h.height) return;
      setFocus({
        x: (r.left + r.width / 2 - h.left) / h.width,
        // the shader's y runs from the bottom
        y: 1 - (r.top + r.height / 2 - h.top) / h.height,
      });
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (sectionRef.current) ro.observe(sectionRef.current);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);
  const t = config.token;
  const links = derivedLinks();
  const buy = buyLink();
  const composition = config.hero?.composition ?? "editorial-3d";
  const mascot = config.hero?.mascot ?? "auto";
  const showScene = composition === "editorial-3d" && mascot !== "none" && mascot !== "image";
  const showImage = composition === "split-image" || (composition === "editorial-3d" && mascot === "image");
  const heroImage = config.assets?.heroImage ?? t.image;
  const headline = config.hero?.headline ?? t.name;
  const points = config.hero?.points ?? [];
  const centered = composition === "centered";

  const Chip = (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease }}
      className="glass label-pixel mb-7 inline-flex items-center gap-2.5 px-3 py-2 text-[12px] text-fg/85"
    >
      <img src={t.image} alt="" className="pixel-img h-4 w-4" />
      <span>
        {isLive ? "Live on" : "Launching on"} {CHAINS[t.chain].label}
      </span>
      <span className="h-1.5 w-1.5 bg-accent" />
      <span>${t.symbol}</span>
    </motion.div>
  );

  const Text = (
    <div className={`flex flex-col ${centered ? "items-center text-center" : "items-start text-left"}`}>
      {Chip}
      <motion.h1
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, delay: 0.05, ease }}
        className="font-display text-5xl font-extrabold leading-[0.95] tracking-[-0.04em] sm:text-6xl md:text-7xl lg:text-8xl"
      >
        {(() => {
          const [gold, rest] = splitDisplayName(headline);
          return (
            <>
              <span className="font-pixel pixel-cap text-accent2">{gold}</span>
              {rest && <span className="text-fg">{rest}</span>}
            </>
          );
        })()}
      </motion.h1>
      <motion.p
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, delay: 0.15, ease }}
        className="mt-6 max-w-xl text-lg leading-relaxed text-fg/90 md:text-xl"
      >
        {t.tagline}
      </motion.p>
      {points.length > 0 && (
        <motion.ol
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.22, ease }}
          className="mt-7 flex flex-col gap-2.5 text-sm text-fg/90"
        >
          {points.slice(0, 4).map((p, i) => (
            <li key={p} className="flex items-start gap-3">
              <span className="mt-0.5 bg-accent/15 px-1.5 py-1 font-mono text-[10px] font-semibold leading-none text-accent">
                0{i + 1}
              </span>
              <span>{p}</span>
            </li>
          ))}
        </motion.ol>
      )}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, delay: 0.3, ease }}
        className="mt-6"
      >
        <Countdown />
      </motion.div>
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, delay: 0.35, ease }}
        className={`mt-6 flex flex-col gap-3 sm:flex-row ${centered ? "items-center" : "items-start sm:items-center"}`}
      >
        <Button href={buy ?? undefined} disabled={!isLive}>
          {isLive ? `Buy $${t.symbol}` : "Launching soon"}
          <ArrowRight className="h-4 w-4" />
        </Button>
        {/* The other thing a visitor can do on this page, next to the thing they cannot do yet. The href
            does the scrolling on its own; the handler unrolls the panel it scrolls to. */}
        <Button href="#create" variant="gold" onClick={() => openCreateForm()}>
          <Sparkles className="h-4 w-4" />
          Create your own
        </Button>
        {links.x && (
          <Button href={links.x} variant="ghost">
            <XIcon className="h-4 w-4" />
            Follow on X
          </Button>
        )}
        {links.telegram && (
          <Button href={links.telegram} variant="ghost">
            <Send className="h-4 w-4" />
            Join Telegram
          </Button>
        )}
      </motion.div>
    </div>
  );

  const Visual = showScene ? (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.9, delay: 0.2, ease }}
      ref={visualRef}
      className="relative mx-auto aspect-square w-full max-w-[208px] sm:max-w-[300px] lg:ml-[-7%] lg:h-[min(680px,68vh)] lg:w-[121%] lg:max-w-none"
    >
      {/* Holds the chest's place while it loads. Deliberately static: the main thread stalls while three.js
          compiles and uploads, and anything animating here would stutter through that stall -- which is the
          glitch the fade is meant to remove. */}
      <div
        aria-hidden
        className={`pointer-events-none absolute inset-0 transition-opacity duration-[900ms] ease-out ${
          sceneReady ? "opacity-0" : "opacity-100"
        }`}
        style={{
          background:
            "radial-gradient(42% 34% at 52% 46%, color-mix(in srgb, var(--accent2) 26%, transparent), transparent 70%)",
        }}
      />
      {/* The chest is the shortest path to what the site is about, so it links to the vault section.
          An <a> around the canvas keeps it keyboard reachable and announced; the 3D hover still works
          because pointer events reach the canvas underneath. */}
      <a
        href="#vault"
        aria-label="Go to the vault section"
        data-scene
        className={`block h-full w-full transition-opacity duration-[900ms] ease-out ${
          sceneReady ? "opacity-100" : "opacity-0"
        }`}
      >
        <Suspense fallback={null}>
          <TokenScene onReady={() => setSceneReady(true)} />
        </Suspense>
      </a>
    </motion.div>
  ) : showImage ? (
    <motion.img
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.9, delay: 0.2, ease }}
      src={heroImage}
      alt=""
      className="mx-auto w-full max-w-[520px] rounded-[var(--radius)] object-contain"
    />
  ) : null;

  return (
    <section ref={sectionRef} id="top" className="relative flex min-h-[100svh] flex-col overflow-hidden">
      <Background focus={focus} />

      <div
        className={`relative z-10 mx-auto flex w-full max-w-6xl flex-1 items-center px-6 pb-8 pt-24 ${
          centered ? "justify-center" : ""
        }`}
      >
        {centered || !Visual ? (
          <div className={centered ? "max-w-4xl" : "max-w-3xl"}>{Text}</div>
        ) : (
          <div className="grid w-full items-center gap-12 lg:grid-cols-12">
            <div className="lg:col-span-6">{Text}</div>
            <div className="lg:col-span-6">{Visual}</div>
          </div>
        )}
      </div>

      <LaunchStrip />
    </section>
  );
}
