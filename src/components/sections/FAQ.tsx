import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Plus } from "lucide-react";
import { config } from "../../lib/config";
import Section from "../ui/Section";

export default function FAQ() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <Section id="faq" eyebrow="FAQ" title="Questions, answered">
      <ul className="mx-auto flex max-w-3xl flex-col gap-3">
        {config.faq.map((f, i) => {
          const isOpen = open === i;
          return (
            <li key={f.q} className="panel">
              <button
                onClick={() => setOpen(isOpen ? null : i)}
                className="flex w-full items-center justify-between gap-4 px-6 py-5 text-left"
                aria-expanded={isOpen}
              >
                <span className="flex items-start gap-3">
                  {/* The prompt marker of a dialogue box: it points at the line being spoken. */}
                  <span aria-hidden className={`mt-0.5 text-accent3 ${isOpen ? "caret" : ""}`}>&#9656;</span>
                  <span className="font-pixel text-[13px] leading-[1.5] text-fg">{f.q}</span>
                </span>
                <Plus className={`h-5 w-5 shrink-0 text-accent3 transition-transform ${isOpen ? "rotate-45" : ""}`} />
              </button>
              <AnimatePresence initial={false}>
                {isOpen && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                    className="overflow-hidden"
                  >
                    <p className="px-6 pb-5 pl-12 text-sm leading-relaxed text-muted">{f.a}</p>
                  </motion.div>
                )}
              </AnimatePresence>
            </li>
          );
        })}
      </ul>
    </Section>
  );
}
