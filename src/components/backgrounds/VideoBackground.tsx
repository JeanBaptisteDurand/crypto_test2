interface Props {
  /** Absolute URL on R2 (or any CDN). Never ship videos inside dist: Cloudflare Pages caps files at 25 MiB. */
  src: string;
  poster?: string | null;
  className?: string;
}

/**
 * Full-bleed looping video, exactly as the design guide prescribes:
 * autoplay + loop + muted + playsinline, object-fit cover, no overlay and no opacity on the video itself.
 * Contrast for the text is handled by the Hero's bottom gradient, not by dimming the footage.
 * Provide both .webm and .mp4 with the same basename (scripts/assets.sh does this) for best compression.
 */
export default function VideoBackground({ src, poster, className = "" }: Props) {
  const base = src.replace(/\.(mp4|webm)$/i, "");
  const hasPair = /\.(mp4|webm)$/i.test(src);
  return (
    <video
      className={`h-full w-full object-cover ${className}`}
      autoPlay
      loop
      muted
      playsInline
      preload="auto"
      poster={poster ?? undefined}
      aria-hidden
    >
      {hasPair ? (
        <>
          <source src={`${base}.webm`} type="video/webm" />
          <source src={`${base}.mp4`} type="video/mp4" />
        </>
      ) : (
        <source src={src} />
      )}
    </video>
  );
}
