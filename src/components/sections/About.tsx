import { config } from "../../lib/config";
import Section from "../ui/Section";

/**
 * The mechanism in four beats. Everything else about the vault lives in its own section.
 *
 * ⚠ Steps 03 and 04 used to read "24 hours pass" and "Holders split it, in proportion to what they
 * hold". Both are gone. No contract performs that distribution: a token launched through Pons is a
 * fixed-supply ERC-20 with no transfer hook under our control, so per-holder accrual cannot be
 * checkpointed on chain at all, and the fees arrive at a wallet. Describing an automatic pro-rata
 * payout would have been describing a mechanism that does not exist -- see §7 of
 * `docs/superpowers/specs/2026-09-08-ponsfund-pons-v2-launchpad-design.md`.
 *
 * What replaces them is the part that IS enforced by code, and it is the stronger claim: the
 * destination is fixed in the launch transaction and has no setter.
 */
const steps = [
  {
    n: "01",
    title: "A token launches",
    text: "Any token launched through PonsFund, starting with the ones in the strip above.",
  },
  {
    n: "02",
    title: "Its creator fees fill the vault",
    text: "The whole creator share of its swap fees goes to one shared treasury, not to a wallet of its own.",
  },
  {
    n: "03",
    title: "The destination is sealed",
    text: "It is written into the launch transaction. Pons exposes no setter for it, so nobody can point it elsewhere later — not the launcher, not us.",
  },
  {
    n: "04",
    title: "The vault fills, in public",
    text: "Every fee that reaches it is a transaction on the explorer, attributable to the launch that produced it.",
  },
];

export default function About() {
  return (
    <Section
      id="about"
      image="/sections/about.webp"
      line="Keystone is waiting for you"
      imageSide="left"
      eyebrow="How it works"
      title="A vault, filled by launches"
      subtitle={config.token.description}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {steps.map((s) => (
          <div key={s.n} className="panel p-5">
            <span className="inline-block bg-accent2 px-2 py-1 font-mono text-[11px] font-bold text-bg">{s.n}</span>
            <h3 className="mt-4 font-pixel text-[15px] leading-[1.5] text-fg">{s.title}</h3>
            <p className="mt-3 text-sm leading-relaxed text-muted">{s.text}</p>
          </div>
        ))}
      </div>
    </Section>
  );
}
