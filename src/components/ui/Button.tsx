import type { ComponentProps } from "react";

type Props = ComponentProps<"a"> & { variant?: "primary" | "ghost" | "gold"; disabled?: boolean };

/**
 * An arcade key rather than a web button: square, a hard 2px frame, a drop shadow with no blur, and a
 * press that pushes the whole thing into the board. The stepped transitions live in `.btn-pixel`.
 */
export default function Button({ variant = "primary", disabled, className = "", children, ...rest }: Props) {
  const base =
    "btn-pixel inline-flex items-center justify-center gap-2.5 px-6 py-3.5 text-[12px] leading-none select-none";
  // "gold" is the treasure colour used solid, as a key rather than as decor. It is deliberately not the
  // default: the page's rule is that gold ornaments and the accents act, so a second solid gold button
  // beside this one would flatten both. One per screen.
  const styles =
    variant === "primary"
      ? "bg-accent text-bg"
      : variant === "gold"
        ? "bg-accent2 text-bg"
        : "bg-accent3/[0.18] text-accent3 backdrop-blur-md hover:bg-accent3/[0.28]";
  const state = disabled ? "opacity-50 pointer-events-none" : "";
  return (
    <a
      className={`${base} ${styles} ${state} ${className}`}
      aria-disabled={disabled}
      target={rest.href?.startsWith("http") ? "_blank" : undefined}
      rel={rest.href?.startsWith("http") ? "noreferrer" : undefined}
      {...rest}
    >
      {children}
    </a>
  );
}
