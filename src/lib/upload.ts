/**
 * Uploading a token image to PonsFund's own host.
 *
 * ## Why this exists at all
 *
 * Pons writes the logo into the token's constructor as a **string**, and it cannot host a file. So a
 * launch either carries a public https URL or carries nothing, and "paste a URL" is a form field
 * most people cannot fill: they have a PNG on their desktop, not a hosted image.
 *
 * `server.mjs` stores the file under a content-addressed name and returns an absolute URL on this
 * site's own domain.
 *
 * ## ⛔⛔ THE URL IS PERMANENT, WHICH CHANGES HOW FAILURE MUST BE HANDLED
 *
 * There is no setter for a token's logo. A launcher who believes their image was accepted when it
 * was not launches a token that is imageless forever. So every failure here CLEARS the field and
 * says so in words, rather than leaving a half-written value that looks like it worked.
 */

/** Matches the server's own limit. Checked here too, so an oversized file fails instantly. */
export const LOGO_MAX_BYTES = 4 * 1024 * 1024;

/**
 * Whether this deployment can actually store an image.
 *
 * ⚠⚠ READS THE BODY, NOT THE STATUS CODE. On a static host — Cloudflare Pages, or `serve -s dist` —
 * `/api/logo` falls through to the SPA rule and answers **200 with the home page's HTML**. A probe
 * that trusted the status would show a drop zone that silently cannot work. Credit to OpenPons,
 * whose `upload.ts` flags exactly this trap.
 */
export async function logoUploadAvailable(): Promise<boolean> {
  try {
    const res = await fetch("/api/logo", { headers: { accept: "application/json" } });
    if (!res.ok) return false;
    const body = (await res.json().catch(() => null)) as { upload?: boolean } | null;
    return body?.upload === true;
  } catch {
    return false;
  }
}

export async function uploadLogo(file: File): Promise<{ url: string; bytes: number }> {
  if (file.size > LOGO_MAX_BYTES) {
    throw new Error(`that is larger than the ${LOGO_MAX_BYTES / 1024 / 1024} MB limit`);
  }
  const res = await fetch("/api/logo", { method: "POST", body: file });
  const body = (await res.json().catch(() => null)) as
    | { url?: string; bytes?: number; error?: string }
    | null;
  if (!res.ok || !body?.url) {
    /* ⚠ The server's own sentence wins. It knows whether the file was an SVG, too large, or stored
       but unreachable; a bare status code tells the launcher none of those. */
    throw new Error(body?.error ?? `the upload failed (${res.status})`);
  }
  return { url: body.url, bytes: body.bytes ?? file.size };
}
