import { config } from "../../lib/config";
import ShaderBackground from "./ShaderBackground";
import VideoBackground from "./VideoBackground";

/**
 * Picks the hero background from launch.config.json → design.background.
 *   "shader"   zero assets, GPU generated (default)
 *   "video"    looping video from R2 (design.videoUrl), shader is NOT used
 *   "gradient" pure CSS, lightest possible
 * The wrapper is absolutely positioned and sits behind the hero content (z-0).
 */
export default function Background({ focus }: { focus?: { x: number; y: number } }) {
  const d = config.design;
  return (
    <div className="absolute inset-0 z-0 overflow-hidden">
      {d.background === "video" && d.videoUrl ? (
        <VideoBackground src={d.videoUrl} poster={d.videoPoster} />
      ) : d.background === "gradient" ? (
        <div className="bg-gradient-animated h-full w-full" />
      ) : (
        <ShaderBackground
          preset={d.shaderPreset ?? "aurora"}
          palette={d.palette}
          // The dither preset is drawn in chunks anyway, so rendering it at 0.55 costs half the pixels of
          // the 0.75 default and only makes the chunks a little larger -- which suits a lo-fi effect.
          scale={d.shaderPreset === "dither" ? 0.55 : undefined}
          focus={focus}
          image={d.backgroundImage ?? undefined}
        />
      )}
      {/* Bottom fade into the page background so the hero blends into the first section.
          This is the only "overlay": it never covers the middle of the footage. */}
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 h-48"
        style={{ background: "linear-gradient(to bottom, transparent, var(--bg))" }}
      />
    </div>
  );
}
