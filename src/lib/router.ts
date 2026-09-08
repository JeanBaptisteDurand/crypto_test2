import { useEffect, useState } from "react";
import { isAddress } from "./config";

/**
 * Two routes: the launch page, and one page per token.
 *
 * ## ⚠⚠ THIS ONLY WORKS BECAUSE THE HOST FALLS BACK TO index.html
 *
 * `/token/0x…` is a real path, not a hash. Without an SPA fallback every link works inside the app
 * and every **refresh** and every **shared link** is a 404 — which is the worst possible failure for
 * a token page, since being shareable is the entire reason it exists rather than a panel.
 *
 * `public/_redirects` carries that fallback for Cloudflare Pages. The deploy and this file are a
 * pair; changing one without the other breaks the other.
 *
 * ⭐ In-page anchors keep working. `#create` is a fragment, not a path, so it is left to the browser
 * on the home page and turned into a navigation plus a scroll from anywhere else.
 */
export type Route = { name: "home" } | { name: "token"; address: string };

export function parsePath(pathname: string): Route {
  const p = pathname.replace(/\/+$/, "") || "/";
  if (p.startsWith("/token/")) {
    const a = p.slice("/token/".length).split("/")[0] ?? "";
    /* ⚠ Validated here, not in the page. A malformed address in the URL would otherwise reach viem
       as a contract call and surface as an unreadable RPC error instead of "no such token". */
    if (isAddress(a)) return { name: "token", address: a };
  }
  return { name: "home" };
}

export const tokenHref = (address: string) => `/token/${address}`;

/** Push a path and tell the app. Exported for the few places that navigate without an anchor. */
export function navigate(href: string) {
  if (href === window.location.pathname + window.location.hash) return;
  window.history.pushState(null, "", href);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

/**
 * Whether this click should be handled in the page rather than by the browser.
 *
 * ⛔ Every one of these checks earns its place. Skipping the modifier keys breaks middle-click and
 * cmd-click, which is how people open a token in a new tab; skipping `target` breaks any link meant
 * to leave; skipping the origin check would swallow the explorer links, which must leave.
 */
function isInternalNavigation(e: MouseEvent): string | null {
  if (e.defaultPrevented || e.button !== 0) return null;
  if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return null;
  const anchor = (e.target as Element | null)?.closest?.("a");
  if (!anchor) return null;
  const href = anchor.getAttribute("href");
  if (!href || anchor.hasAttribute("download") || anchor.getAttribute("target") === "_blank") return null;
  // A bare fragment is the browser's job, and hijacking it would break every section link.
  if (href.startsWith("#")) return null;
  if (!href.startsWith("/")) return null;
  return href;
}

/**
 * The current route, and a document-level click handler that turns internal links into navigation.
 *
 * Delegated on the document rather than exposed as a `<Link>` component: the alternative is every
 * caller remembering to use it, and the one that forgets does a full page reload that looks like a
 * slow site rather than a bug.
 */
export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parsePath(window.location.pathname));

  useEffect(() => {
    const onPop = () => setRoute(parsePath(window.location.pathname));
    const onClick = (e: MouseEvent) => {
      const href = isInternalNavigation(e);
      if (href === null) return;
      e.preventDefault();
      navigate(href);
    };
    window.addEventListener("popstate", onPop);
    document.addEventListener("click", onClick);
    return () => {
      window.removeEventListener("popstate", onPop);
      document.removeEventListener("click", onClick);
    };
  }, []);

  /* A route change is a new page as far as a reader is concerned, so it starts at the top. Without
     this, opening a token from halfway down the board lands halfway down the token page. */
  useEffect(() => {
    if (!window.location.hash) window.scrollTo(0, 0);
  }, [route]);

  return route;
}
