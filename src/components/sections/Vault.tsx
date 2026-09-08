import { Landmark, Timer, Users } from "lucide-react";
import { CHAINS, config, shortAddress } from "../../lib/config";
import Section from "../ui/Section";

/**
 * The shared vault. Every figure here is on-chain and none of it exists before launch, so each tile states
 * that plainly rather than showing a placeholder number that could be mistaken for real.
 *
 * ⚠ The heading was "One vault, split every 24 hours" and the subtitle promised a distribution. No
 * contract splits this balance -- the fees arrive at a wallet, and a token launched through Pons has
 * no transfer hook we control, so per-holder accrual cannot be checkpointed on chain at all. The copy
 * now states what the launch transaction actually enforces. See the note in `About.tsx` and §7 of
 * `docs/superpowers/specs/2026-09-08-ponsfund-pons-v2-launchpad-design.md`.
 *
 * ⛔ `vault.cycleHours` and `vault.firstPayoutAt` still drive the hero's Countdown, which shows a
 * clock ticking down to a distribution. That component is inside the hero, which BRIEF.md §0 bis
 * locks, so it is left alone and flagged rather than removed. It is the last place on the site
 * that promises the payout.
 */
export default function Vault() {
  const v = config.vault;
  if (!v) return null;
  const chain = CHAINS[config.token.chain];
  const live = Boolean(v.address);

  /*
    ⚠ All three tiles used to describe a distribution. "Distribution cycle -- Every 24 hours", and
    two notes about holders taking a proportional share at a snapshot. None of it is performed by a
    contract, so all three now state what is checkable instead: the balance, the share of the fee,
    and where the destination is decided.
  */
  const tiles = [
    {
      icon: Landmark,
      label: "In the vault",
      value: live ? "Read on the explorer" : "Not yet",
      note: live
        ? "The address is published below. Its balance is public, and so is every transfer into it."
        : "The address is published here as soon as it exists.",
    },
    {
      icon: Timer,
      label: "Share of the fee",
      value: "100%",
      note: "The whole creator side of the swap fee, from every launch made through PonsFund.",
    },
    {
      icon: Users,
      label: "Set at",
      value: "Launch time",
      note: "Written into the launch transaction. Pons exposes no setter, so it cannot be changed afterwards.",
    },
  ];

  return (
    <Section
      id="vault"
      image="/sections/vault.webp"
      line="Help Keystone fill his vault"
      imageSide="right"
      eyebrow="The vault"
      title="One vault, every launch pays into it"
      subtitle="Every token launched through PonsFund sends the whole creator share of its swap fees here, on terms written into its launch transaction. Every fee that arrives is readable on the explorer."
    >
      <div className="grid gap-3 sm:grid-cols-3">
        {tiles.map((t) => (
          <div key={t.label} className="panel p-4">
            <div className="pixel-frame mb-4 grid h-10 w-10 place-items-center bg-accent2/15 text-accent2">
              <t.icon className="h-5 w-5" />
            </div>
            <p className="label-pixel text-[12px] text-muted">{t.label}</p>
            <p className="mt-3 font-display text-xl font-bold leading-snug text-accent2">{t.value}</p>
            <p className="mt-2.5 text-[13px] leading-relaxed text-muted">{t.note}</p>
          </div>
        ))}
      </div>

      <div className="panel mt-4 flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          {/* The mascot stands next to the vault line, bobbing on two frames. The page had no sprite of
              its own below the hero, and this is the one place the chest belongs. */}
          <img
            src={config.token.image}
            alt=""
            aria-hidden
            className="pixel-img sprite-idle hidden h-14 w-14 shrink-0 object-contain sm:block"
          />
          <div>
          <p className="label-pixel text-[12px] text-muted">Vault address</p>
          <p className="mt-1 font-mono text-sm">
            {v.address ? shortAddress(v.address) : "Published before the first launch"}
          </p>
          </div>
        </div>
        {v.address && (
          <a
            href={`${chain.explorer}/address/${v.address}`}
            target="_blank"
            rel="noreferrer"
            className="label-pixel text-[12px] text-accent3 hover:underline"
          >
            View on {chain.explorerName}
          </a>
        )}
      </div>
    </Section>
  );
}
