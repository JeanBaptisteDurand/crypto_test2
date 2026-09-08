import { motion } from "motion/react";
import type { ReactNode } from "react";
import SectionCapsule from "./SectionCapsule";

interface Props {
  id: string;
  eyebrow?: string;
  title: string;
  subtitle?: string;
  children: ReactNode;
  className?: string;
  /** Art for the capsule beside the section, from public/sections. */
  image?: string;
  /** The mascot's line in the capsule's dialogue box. */
  line?: string;
  /** `object-position` for the art inside its frame, when the subject is off to one side. */
  focal?: string;
  /** Which side the capsule sits on. The sections alternate it down the page. */
  imageSide?: "left" | "right";
}

/**
 * Shared section shell: anchor id, eyebrow, title, scroll reveal, and the illustrated capsule beside it.
 *
 * With a capsule the section is two columns: the copy takes the fluid one, the square panel takes a fixed
 * 440px one, so its side is the same on every section and the page gets a column of portraits down its
 * right edge.
 *
 * The panel changes sides down the page (`imageSide`), so the eye zig-zags instead of running down a
 * column of pictures. On mobile the copy always comes first: the order is a `lg:` concern only, done with
 * `order` rather than DOM order so the reading order stays right.
 *
 * Section height and panel height are the same height, by construction: the panel stretches to the row
 * (`h-full`), so it is exactly as tall as the copy beside it. A strictly square panel cannot do that --
 * its side would have to be the column width, and no section is 440px tall once it has a header and a
 * grid of cards -- so the panel takes the section's height and crops the art to fit, which keeps the
 * subject centred. Below `lg` it goes back to a true square, stacked under the copy.
 * The vertical rhythm was cut to suit: less padding, tighter header, cards at p-5.
 */
export default function Section({
  id,
  eyebrow,
  title,
  subtitle,
  children,
  className = "",
  image,
  line,
  focal,
  imageSide = "right",
}: Props) {
  const Body = (
    <>
      <motion.header
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className="mb-8 max-w-2xl"
      >
        {eyebrow && (
          <p className="label-pixel mb-4 flex items-center gap-2.5 text-[12px] text-accent2">
            <span aria-hidden className="inline-block h-2 w-2 bg-accent2" />
            {eyebrow}
          </p>
        )}
        <h2 className="font-pixel text-3xl leading-[1.25] text-fg md:text-5xl">{title}</h2>
        {subtitle && <p className="mt-5 text-base leading-relaxed text-muted md:text-lg">{subtitle}</p>}
      </motion.header>
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.6, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
      >
        {children}
      </motion.div>
    </>
  );

  return (
    <section id={id} className={`relative mx-auto w-full max-w-6xl px-6 py-14 md:py-16 ${className}`}>
      {image ? (
        <div
          className={`grid items-stretch gap-10 ${
            imageSide === "left" ? "lg:grid-cols-[480px_minmax(0,1fr)]" : "lg:grid-cols-[minmax(0,1fr)_480px]"
          }`}
        >
          <div
            className={`lg:flex lg:min-h-[420px] lg:flex-col lg:justify-center ${
              imageSide === "left" ? "lg:order-2" : ""
            }`}
          >
            {Body}
          </div>
          <SectionCapsule
            src={image}
            line={line}
            focal={focal}
            className={imageSide === "left" ? "lg:order-1" : ""}
          />
        </div>
      ) : (
        Body
      )}
    </section>
  );
}
