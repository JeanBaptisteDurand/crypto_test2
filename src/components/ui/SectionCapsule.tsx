import { motion } from "motion/react";

interface Props {
  /** 256px-wide art from public/sections. Small on purpose: see the note on pixelising below. */
  src: string;
  /** The line the mascot says, in the dialogue box. */
  line?: string;
  /**
   * Where to hold the art while the frame crops it, as an `object-position`. The frame is taller than it
   * is wide, so a square picture loses about a sixth off each side; a prop off to one side (the map, the
   * hourglass) needs the window pushed its way.
   */
  focal?: string;
  className?: string;
}

/**
 * The illustration beside a section: a square panel in the RPG window frame, the art blown up through
 * nearest-neighbour so it keeps the console-era pixel grid, a CRT scanline and bloom pass on top, and a
 * dialogue box across the bottom.
 *
 * The pixelising is done by serving the art small (256px) and letting `image-rendering: pixelated` scale
 * it up. Downscaling by an integer factor with nearest-neighbour preserves the original pixel grid, where
 * a CSS filter on a full-resolution image would only blur it.
 *
 * It arrives on scroll and then stays put. It used to be `sticky`, which made it ride the scroll down the
 * section -- the owner wants the entrance, not the ride.
 */
export default function SectionCapsule({ src, line, focal, className = "" }: Props) {
  return (
    <motion.figure
      initial={{ opacity: 0, y: 28, scale: 0.97 }}
      whileInView={{ opacity: 1, y: 0, scale: 1 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.65, delay: 0.12, ease: [0.22, 1, 0.36, 1] }}
      // No `overflow-hidden`: it clips pseudo-elements to the padding box, and the frame's corner studs
      // are drawn outside it. Nothing overflows anyway -- the art is absolutely sized to the box.
      className={`rpg-frame relative aspect-square w-full lg:aspect-auto lg:h-full lg:min-h-[420px] ${className}`}
    >
      <img
        src={src}
        alt=""
        style={focal ? { objectPosition: focal } : undefined}
        className="pixel-img absolute inset-0 h-full w-full object-cover"
      />
      <div className="crt-scan" aria-hidden />
      <div className="crt-glass" aria-hidden />
      {line && (
        <figcaption className="dialogue absolute inset-x-4 bottom-4 flex items-center gap-3 px-4 py-3.5">
          <span className="label-pixel flex-1 text-[13px] leading-[1.5] text-fg">{line}</span>
          <span aria-hidden className="caret shrink-0 text-accent2">&#9662;</span>
        </figcaption>
      )}
    </motion.figure>
  );
}
