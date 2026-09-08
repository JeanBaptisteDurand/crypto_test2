import { Camera, PieChart, Send } from "lucide-react";
import { config } from "../../lib/config";
import Section from "../ui/Section";

/**
 * The first-distribution giveaway. Renders only when `giveaway.enabled` is true, because the pot itself is
 * still undecided (see BRIEF section 10): the mechanic below is settled, where the pot comes from is not.
 * Wording is deliberate — a share, never a win, never a reward.
 */
export default function Giveaway() {
  const g = config.giveaway;
  if (!g?.enabled) return null;

  const steps = [
    {
      icon: Camera,
      title: "A snapshot",
      text: "One block, announced ahead of time. Its hash is published here once it has passed.",
    },
    {
      icon: PieChart,
      title: "Your share of the supply",
      text: "Your share of the giveaway equals your share of the supply at that block. No draw, no picked winners.",
    },
    {
      icon: Send,
      title: "One transaction",
      text: "The split goes out in a single transaction, readable on the explorer.",
    },
  ];

  return (
    <Section
      id="giveaway"
      eyebrow="Giveaway"
      title="Split the same way as the vault"
      subtitle="Everyone holding at the snapshot takes a share, proportional to what they hold."
    >
      <div className="grid gap-4 md:grid-cols-3">
        {steps.map((s) => (
          <div key={s.title} className="panel p-5">
            <div className="pixel-frame mb-5 grid h-11 w-11 place-items-center bg-accent2/15 text-accent2">
              <s.icon className="h-5 w-5" />
            </div>
            <h3 className="font-pixel text-[15px] leading-[1.5] text-fg">{s.title}</h3>
            <p className="mt-3 text-sm leading-relaxed text-muted">{s.text}</p>
          </div>
        ))}
      </div>

      <dl className="panel mt-4 grid gap-6 p-6 sm:grid-cols-3">
        <div>
          <dt className="label-pixel text-[12px] text-muted">Share</dt>
          <dd className="mt-1 font-mono text-sm">{g.share}</dd>
        </div>
        <div>
          <dt className="label-pixel text-[12px] text-muted">Minimum to qualify</dt>
          <dd className="mt-1 font-mono text-sm">{g.minHold}</dd>
        </div>
        <div>
          <dt className="label-pixel text-[12px] text-muted">Snapshot block</dt>
          <dd className="mt-1 font-mono text-sm">{g.snapshotBlock ?? "Announced before the snapshot"}</dd>
        </div>
      </dl>
    </Section>
  );
}
