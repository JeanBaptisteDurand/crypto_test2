import { config } from "../../lib/config";
import Section from "../ui/Section";

/**
 * The roadmap as a quest log: numbered quests, a status stamp, and a square tick per objective. Phase 1 is
 * the active quest, the rest are still locked -- which is what the phases already meant, said in the
 * grammar the rest of the page now uses.
 */
const ROMAN = ["I", "II", "III", "IV", "V"];

export default function Roadmap() {
  return (
    <Section
      id="roadmap"
      eyebrow="Quest log"
      title="Where this goes"
      image="/sections/roadmap.webp"
      line="Keystone knows where this goes"
      imageSide="right"
      /* hold the hourglass in frame */
      focal="74% 50%"
    >
      <ol className="relative grid gap-4">
        {config.roadmap.map((ph, i) => {
          const active = i === 0;
          return (
            <li key={ph.phase} className="panel relative p-5">
              <div className="mb-5 flex items-start justify-between gap-3">
                <div>
                  {/* Roman, not arabic: "QUEST 2" in the pixel face is a coin toss between 2 and 8,
                      and a numeral is the more RPG form anyway. */}
                  <p className="label-pixel text-[12px] text-muted">Quest {ROMAN[i] ?? i + 1}</p>
                  <h3 className="mt-2 font-pixel text-[17px] leading-snug text-fg">{ph.title}</h3>
                </div>
                <span
                  className={`label-pixel shrink-0 px-2 py-1 text-[12px] ${
                    active ? "bg-accent text-bg" : "bg-fg/10 text-muted"
                  }`}
                >
                  {active ? "Active" : "Locked"}
                </span>
              </div>
              <ul className="flex flex-col gap-2.5">
                {ph.items.map((it) => (
                  <li key={it} className="flex items-start gap-2.5 text-sm leading-relaxed text-fg/85">
                    <span
                      aria-hidden
                      className={`mt-1 h-3 w-3 shrink-0 ${
                        active ? "bg-accent" : "bg-transparent"
                      }`}
                      style={{ boxShadow: `inset 0 0 0 2px ${active ? "var(--accent)" : "var(--muted)"}` }}
                    />
                    {it}
                  </li>
                ))}
              </ul>
            </li>
          );
        })}
      </ol>
    </Section>
  );
}
