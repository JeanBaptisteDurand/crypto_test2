import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Menu, X } from "lucide-react";
import { buyLink, config, isLive } from "../lib/config";
import Button from "./ui/Button";

const links = [
  { href: "#launches", label: "The board" },
  { href: "#about", label: "How it works" },
  { href: "#vault", label: "The vault" },
  { href: "#tokenomics", label: "Tokenomics" },
  { href: "#how-to-buy", label: "How to buy" },
  { href: "#roadmap", label: "Roadmap" },
  { href: "#create", label: "Make one" },
  { href: "#faq", label: "FAQ" },
];

/**
 * A rule across the top rather than a floating pill. The pill read as a separate object sitting on the
 * page, which fought the flat, squared-off register the rest of the site moved to. The bar is transparent
 * over the hero and only takes a background once scrolled, so the dither runs uninterrupted at the top.
 */
export default function Navbar() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const buy = buyLink();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      // A status bar, not a transparent overlay: with the village lifted, bare links sat at 3.6:1 over it.
      // It carries a tint from the start and firms up once scrolled.
      className={`fixed inset-x-0 top-0 z-50 border-b backdrop-blur-md transition-colors duration-300 ${
        scrolled ? "border-fg/12 bg-bg/85" : "border-fg/10 bg-bg/55"
      }`}
    >
      <motion.nav
        initial={{ y: -16, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="mx-auto flex w-full max-w-6xl items-center justify-between gap-6 px-6 py-3.5"
      >
        {/* Brand: the logo boxed in gold, wordmark beside it on the bare bar. Boxing the mark is what sets
            the brand apart, so the whole lockup does not need a panel of its own. */}
        <a href="#top" className="group flex items-center gap-3">
          <span className="pixel-frame grid h-9 w-9 place-items-center bg-accent2/10 transition group-hover:bg-accent2/20">
            <img src={config.token.image} alt="" className="pixel-img h-6 w-6 object-contain" />
          </span>
          <span className="text-[15px] font-bold leading-none tracking-tight">
            <span className="font-pixel pixel-cap text-accent2">Pons</span>
            <span className="font-display text-fg">Fund</span>
          </span>
        </a>

        <ul className="hidden items-center gap-7 md:flex">
          {links.map((l) => (
            <li key={l.href}>
              <a
                href={l.href}
                className="label-pixel relative py-1 text-[12px] text-fg/65 transition-colors after:absolute after:inset-x-0 after:-bottom-1 after:h-[2px] after:origin-left after:scale-x-0 after:bg-accent3 after:transition-transform hover:text-accent3 hover:after:scale-x-100"
              >
                {l.label}
              </a>
            </li>
          ))}
        </ul>

        <div className="flex items-center gap-2">
          <div className="hidden md:block">
            <Button href={buy ?? undefined} disabled={!isLive} className="!px-4 !py-2.5 !text-[10px]">
              {isLive ? `Buy $${config.token.symbol}` : "Coming soon"}
            </Button>
          </div>
          <button
            aria-label="Menu"
            onClick={() => setOpen((v) => !v)}
            className="pixel-frame grid h-9 w-9 place-items-center text-accent3 transition hover:bg-accent3/15 md:hidden"
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </motion.nav>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className="border-t border-fg/10 bg-bg/95 px-4 pb-4 pt-2 backdrop-blur-md md:hidden"
          >
            <ul className="flex flex-col">
              {links.map((l) => (
                <li key={l.href}>
                  <a
                    href={l.href}
                    onClick={() => setOpen(false)}
                    className="label-pixel block border-b border-fg/10 px-2 py-3.5 text-[12px] text-fg/80 transition hover:text-accent3"
                  >
                    {l.label}
                  </a>
                </li>
              ))}
              <li className="pt-3">
                <Button href={buy ?? undefined} disabled={!isLive} className="w-full">
                  {isLive ? `Buy $${config.token.symbol}` : "Coming soon"}
                </Button>
              </li>
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
