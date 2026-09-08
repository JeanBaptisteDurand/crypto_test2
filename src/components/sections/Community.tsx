import { ExternalLink, Send, BarChart3, Search, Rocket } from "lucide-react";
import { CHAINS, config, derivedLinks } from "../../lib/config";
import Section from "../ui/Section";

function XIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M18.244 2H21.5l-7.5 8.57L22.5 22h-6.9l-5.4-7.06L3.9 22H.64l8.02-9.17L.5 2h7.07l4.88 6.45L18.24 2Zm-1.21 18h1.8L7.05 3.9H5.12L17.03 20Z" />
    </svg>
  );
}

export default function Community() {
  const l = derivedLinks();
  const cards = [
    { href: l.x, label: "X / Twitter", text: "Announcements first.", icon: XIcon },
    { href: l.telegram, label: "Telegram", text: "The live room.", icon: Send },
    { href: l.dexscreener, label: "Dexscreener", text: "Chart and trades.", icon: BarChart3 },
    { href: l.basescan, label: CHAINS[config.token.chain].explorerName, text: "Verify the contract.", icon: Search },
    { href: l.clanker, label: "Clanker", text: "Deployment record.", icon: Rocket },
  ].filter((c) => Boolean(c.href));

  return (
    <Section id="community" eyebrow="Community" title={`Join the ${config.token.name} crowd`}>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((c) => (
          <a
            key={c.label}
            href={c.href!}
            target="_blank"
            rel="noreferrer"
            className="panel group flex items-center gap-4 p-5"
          >
            <div className="pixel-frame grid h-11 w-11 place-items-center bg-accent3/[0.18] text-accent3">
              <c.icon className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <div className="label-pixel text-[12px] text-fg">{c.label}</div>
              <div className="mt-1.5 text-sm text-muted">{c.text}</div>
            </div>
            <ExternalLink className="h-4 w-4 text-muted transition group-hover:text-accent3" />
          </a>
        ))}
      </div>
    </Section>
  );
}
