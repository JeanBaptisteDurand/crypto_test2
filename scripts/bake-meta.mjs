/**
 * Write the title, description and Open Graph tags into dist/index.html after the Vite build.
 *
 * ## ⛔⛔ WHY THIS IS NOT OPTIONAL ON A LAUNCHPAD
 *
 * The app fills those tags at runtime from `launch.config.json`. Crawlers do not run JavaScript, so
 * X, Telegram, Discord and Slack all read the file as it was served: `<title></title>`,
 * `og:title=""`, `og:description=""`. Every link anyone shares -- the site, and every `/token/0x…`
 * page -- previews as a blank card.
 *
 * That matters most for the token pages, because being shareable is the entire reason they are real
 * URLs instead of a panel.
 *
 * The kit's Cloudflare path (`scripts/ship.sh`) already bakes these. Railway runs plain
 * `npm run build`, so without this step the two hosts serve visibly different HTML. This is that
 * step, ported so `npm run build` is enough wherever it runs.
 *
 * ## ⚠ WHAT THIS STILL DOES NOT SOLVE
 *
 * Every page gets the SAME card, because there is one index.html. A per-token preview -- the token's
 * own name and logo -- needs the HTML to be generated per request, which on Railway means a tiny
 * server ahead of `serve`, and on Cloudflare an edge function. Not done here, and not pretended.
 */
import { readFileSync, writeFileSync } from "node:fs";

const cfg = JSON.parse(readFileSync(new URL("../launch.config.json", import.meta.url), "utf8"));
const htmlPath = new URL("../dist/index.html", import.meta.url);

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

const title = `${cfg.token.name} ($${cfg.token.symbol})`;
const description = cfg.token.tagline;

/*
 * ⚠ The canonical URL comes from the environment FIRST.
 *
 * `links.website` in the config is the Cloudflare Pages address. A Railway deployment lives on a
 * different domain, and an `og:url` plus `<link rel=canonical>` pointing at the other site tells
 * every crawler that this one is a duplicate of it. Set SITE_URL in the Railway service variables
 * to this deployment's own domain.
 *
 * Railway injects RAILWAY_PUBLIC_DOMAIN by itself, so the common case needs no configuration.
 */
const site = (
  process.env.SITE_URL ||
  (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : "") ||
  cfg.links.website ||
  ""
).replace(/\/$/, "");

let html = readFileSync(htmlPath, "utf8");

/* ⚠ IDEMPOTENT ON PURPOSE. `og:url` and `canonical` are INSERTED rather than replaced, because the
   source index.html has neither -- so running this twice over the same file appended a second copy
   of each and left the crawler two contradictory URLs. `vite build` rewrites index.html every time,
   so a normal build never hit it; running the script alone did. Stripping first costs nothing. */
html = html
  .replace(/\s*<meta property="og:url" content="[^"]*" \/>/g, "")
  .replace(/\s*<link rel="canonical" href="[^"]*" \/>/g, "");

html = html
  .replace(/<title>[^<]*<\/title>/, `<title>${esc(title)}</title>`)
  .replace(/(<meta name="description" content=")[^"]*(")/, `$1${esc(description)}$2`)
  .replace(/(<meta property="og:title" content=")[^"]*(")/, `$1${esc(title)}$2`)
  .replace(/(<meta property="og:description" content=")[^"]*(")/, `$1${esc(description)}$2`)
  .replace(/(<meta name="theme-color" content=")[^"]*(")/, `$1${esc(cfg.design.palette.bg)}$2`);

/* An absolute og:image or the card is blank on most crawlers -- a root-relative path is resolved
   against the crawler's own host, not the site's. Left relative only when no domain is known. */
if (site) {
  html = html
    .replace(/(<meta property="og:image" content=")[^"]*(")/, `$1${esc(`${site}/og.png`)}$2`)
    .replace(
      "</head>",
      `  <meta property="og:url" content="${esc(site)}" />\n  <link rel="canonical" href="${esc(site)}" />\n</head>`,
    );
}

writeFileSync(htmlPath, html);
console.log(`→ meta baked: ${title}${site ? ` @ ${site}` : " (no domain known, og:image left relative)"}`);
