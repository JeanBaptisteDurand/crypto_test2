import { config } from "./config";

/** Push palette, radius and fonts from launch.config.json into CSS variables and load Google Fonts. */
export function applyTheme() {
  const { palette, font, radius } = config.design;
  const root = document.documentElement.style;
  root.setProperty("--bg", palette.bg);
  root.setProperty("--fg", palette.fg);
  root.setProperty("--accent", palette.accent);
  root.setProperty("--accent2", palette.accent2 ?? palette.accent);
  // The interactive colour: everything you can click is drawn in it, so nothing clickable is brown.
  root.setProperty("--accent3", palette.accent3 ?? palette.accent);
  root.setProperty("--muted", palette.muted ?? "#8a8a94");
  if (radius) root.setProperty("--radius", radius);

  const stack = (f: string) => `"${f}", ui-sans-serif, system-ui, sans-serif`;
  root.setProperty("--font-display", stack(font.display));
  root.setProperty("--font-body", stack(font.body));
  if (font.mono) root.setProperty("--font-mono", `"${font.mono}", ui-monospace, SFMono-Regular, monospace`);
  if (font.pixel) root.setProperty("--font-pixel", `"${font.pixel}", ui-monospace, monospace`);

  const families = Array.from(
    new Set([font.display, font.body, ...(font.mono ? [font.mono] : []), ...(font.pixel ? [font.pixel] : [])]),
  )
    .map((f) => `family=${encodeURIComponent(f)}:wght@400;500;600;700;800`)
    .join("&");
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = `https://fonts.googleapis.com/css2?${families}&display=swap`;
  document.head.appendChild(link);

  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", palette.bg);
}

/** Title, description and OG tags from the config (also baked into dist/index.html by scripts/ship.sh). */
export function applyMeta() {
  const t = config.token;
  const title = `${t.name} ($${t.symbol})`;
  document.title = title;
  const set = (sel: string, attr: string, value: string) => {
    const el = document.querySelector(sel);
    if (el) el.setAttribute(attr, value);
  };
  set('meta[name="description"]', "content", t.tagline);
  set('meta[property="og:title"]', "content", title);
  set('meta[property="og:description"]', "content", t.tagline);
}
