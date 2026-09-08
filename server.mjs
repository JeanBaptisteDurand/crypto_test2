/**
 * The PonsFund server: the static site, the SPA fallback, and logo uploads.
 *
 * It replaces `serve -s dist`, which could do the first two but not the third. No dependencies —
 * node's own `http` and `fs` are enough, and a launchpad's upload endpoint is not the place to add
 * an unaudited middleware stack.
 *
 *   node server.mjs           # PORT, or 3000
 *
 * ## ⛔⛔ THE STORAGE DIRECTORY MUST BE A PERSISTENT VOLUME
 *
 * A token's logo URL is written into its constructor and **there is no setter**. If the file behind
 * that URL disappears, the token is imageless permanently — on the site, on gmgn, everywhere, and
 * nothing can fix it.
 *
 * Railway's container filesystem is EPHEMERAL: every redeploy starts from the image and anything
 * written at runtime is gone. So `LOGO_DIR` must point at a mounted Railway Volume. Attach one to
 * the service with mount path `/data` before accepting a single upload.
 *
 * The server refuses to advertise uploads when the directory is not writable, so a missing volume
 * shows up as "no upload available" rather than as tokens whose images vanish a week later.
 */
import { createServer } from "node:http";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync, accessSync, constants } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";

const PORT = Number(process.env.PORT || 3000);
const DIST = resolve("dist");
const LOGO_DIR = resolve(process.env.LOGO_DIR || "/data/logos");
/** Matches the limit the form advertises, and OpenPons's. */
const MAX_BYTES = 4 * 1024 * 1024;

/**
 * ⛔⛔ SVG IS NOT IN THIS LIST AND MUST NOT BE.
 *
 * An SVG is a document: it can carry `<script>`, and it would be served from our own origin, which
 * makes it stored XSS against every visitor who opens a token page. Every other launchpad that
 * accepts SVG logos has this hole. Raster only.
 *
 * ⚠ Detected from the file's own bytes, never from the Content-Type header — that header is written
 * by whoever is uploading and a `.svg` announced as `image/png` would sail straight through.
 */
const MAGIC = [
  { ext: ".png", type: "image/png", test: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 },
  { ext: ".jpg", type: "image/jpeg", test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { ext: ".gif", type: "image/gif", test: (b) => b.subarray(0, 3).toString("latin1") === "GIF" },
  {
    ext: ".webp",
    type: "image/webp",
    test: (b) => b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP",
  },
];

const sniff = (buf) => (buf.length >= 12 ? MAGIC.find((m) => m.test(buf)) : undefined);

/** Whether uploads can actually be served. Checked at boot AND per request; a volume can vanish. */
function storageWritable() {
  try {
    mkdirSync(LOGO_DIR, { recursive: true });
    accessSync(LOGO_DIR, constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * The public base for a stored logo.
 *
 * ⛔ It has to be ABSOLUTE and it has to be the real public domain. The URL is written on chain
 * forever, so a relative path — or a Railway preview domain that later changes — bakes a dead link
 * into somebody's token. `SITE_URL` is the answer; `RAILWAY_PUBLIC_DOMAIN` is the fallback.
 */
function publicBase() {
  const explicit = process.env.SITE_URL;
  if (explicit) return explicit.replace(/\/$/, "");
  if (process.env.RAILWAY_PUBLIC_DOMAIN) return `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`;
  return "";
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".glb": "model/gltf-binary",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
  ".ico": "image/x-icon",
};

const json = (res, code, body) => {
  res.writeHead(code, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
};

function serveFile(res, path, { immutable = false } = {}) {
  const body = readFileSync(path);
  res.writeHead(200, {
    "content-type": MIME[extname(path).toLowerCase()] || "application/octet-stream",
    "content-length": body.length,
    /* Content-addressed names never change contents, so they are safe to cache forever. index.html
       is the opposite: cache it and a deploy does not reach anybody. */
    "cache-control": immutable ? "public, max-age=31536000, immutable" : "no-cache",
  });
  res.end(body);
}

/**
 * Read the request body, refusing anything over the limit.
 *
 * ⛔ THE RESPONSE IS WRITTEN BEFORE THE SOCKET IS TORN DOWN. An earlier version called
 * `req.destroy()` on the first oversized chunk, which killed the connection before the 413 could be
 * flushed -- the browser then reported a network error, and the launcher was told nothing about a
 * size limit. Verified with a 5 MB POST returning an empty body.
 *
 * ⚠ Still aborted mid-stream rather than after: a 100 MB upload must not be buffered just to be
 * rejected. The response goes out, THEN the rest of the request is discarded.
 */
async function readBody(req, res) {
  // Fast path: the header is a hint, not a guarantee, but when it is present and too big there is
  // no reason to read a single byte.
  const declared = Number(req.headers["content-length"] || 0);
  if (declared > MAX_BYTES) {
    tooLarge(res);
    req.resume();
    return null;
  }

  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > MAX_BYTES) {
      tooLarge(res);
      req.resume(); // drain rather than destroy, so the client reads the response we just sent
      return null;
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

const tooLarge = (res) =>
  json(res, 413, { error: `That file is over ${MAX_BYTES / 1024 / 1024} MB. Nothing was uploaded.` });

const server = createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  const path = decodeURIComponent(url.pathname);

  /* ------------------------------------------------------------------ logo API -- */

  if (path === "/api/logo") {
    if (req.method === "GET") {
      /* ⚠⚠ ANSWERS JSON, AND THE CLIENT READS THE BODY RATHER THAN THE STATUS. On a host where this
         server is not running, `/api/logo` falls through to the SPA rule and returns 200 with the
         home page's HTML. A probe that trusted the status would draw a drop zone that cannot work.
         Credit to OpenPons, who flagged exactly this. */
      return json(res, 200, { upload: storageWritable() && Boolean(publicBase()), maxBytes: MAX_BYTES });
    }
    if (req.method !== "POST") return json(res, 405, { error: "POST an image to this path." });

    const base = publicBase();
    if (!base) {
      return json(res, 503, {
        error: "This deployment does not know its own public URL, so it cannot mint a permanent image link. Set SITE_URL.",
      });
    }
    if (!storageWritable()) {
      return json(res, 503, {
        error: "Image storage is not writable. A logo saved here would disappear on the next deploy, and the URL is permanent, so nothing was stored.",
      });
    }

    const buf = await readBody(req, res);
    if (buf === null) return; // readBody already answered 413
    if (buf.length === 0) return json(res, 400, { error: "Empty upload." });

    const kind = sniff(buf);
    if (!kind) {
      return json(res, 415, {
        error: "That is not a PNG, JPEG, GIF or WebP. SVG is refused on purpose: it can carry script and would be served from this domain.",
      });
    }

    /* Content-addressed: the same image uploaded twice is one file, the name cannot collide, and
       nothing a caller sends becomes part of a path. */
    const name = createHash("sha256").update(buf).digest("hex").slice(0, 32) + kind.ext;
    try {
      writeFileSync(join(LOGO_DIR, name), buf);
    } catch {
      return json(res, 500, { error: "The image could not be stored. Nothing was saved." });
    }
    return json(res, 200, { url: `${base}/logos/${name}`, bytes: buf.length, type: kind.type });
  }

  /* ------------------------------------------------------------ stored logos -- */

  if (path.startsWith("/logos/")) {
    // ⚠ `normalize` then a prefix check: without it `/logos/../../etc/passwd` leaves the directory.
    const file = resolve(join(LOGO_DIR, normalize(path.slice("/logos/".length))));
    if (!file.startsWith(LOGO_DIR + "/") || !existsSync(file) || !statSync(file).isFile()) {
      return json(res, 404, { error: "No such image." });
    }
    return serveFile(res, file, { immutable: true });
  }

  /* ------------------------------------------------------------- the SPA ------ */

  if (req.method !== "GET" && req.method !== "HEAD") {
    return json(res, 405, { error: "Method not allowed." });
  }

  const asset = resolve(join(DIST, normalize(path)));
  if (asset.startsWith(DIST) && existsSync(asset) && statSync(asset).isFile()) {
    return serveFile(res, asset, { immutable: asset.includes("/assets/") });
  }

  /* The SPA fallback, which is what `serve -s` was there for. Without it `/token/0x…` is a 404 on
     every refresh and every shared link -- the one thing a token page exists for. */
  return serveFile(res, join(DIST, "index.html"));
});

server.listen(PORT, () => {
  const base = publicBase();
  console.log(`PonsFund on :${PORT}`);
  console.log(`  dist      ${DIST}`);
  console.log(`  logos     ${LOGO_DIR}  ${storageWritable() ? "(writable)" : "⛔ NOT WRITABLE — uploads disabled"}`);
  console.log(`  public    ${base || "⛔ UNKNOWN — set SITE_URL; uploads disabled"}`);
});
