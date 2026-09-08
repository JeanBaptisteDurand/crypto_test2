import type { StripItem } from "./config";

/**
 * Launch drafts made in the browser by the launch form.
 *
 * A draft is a form that has been filled in and not signed: it lives in this visitor's `localStorage` and
 * nowhere else, and the strip labels it "Draft - only you see this". A page that showed one next to a
 * deployed token without saying so would be claiming something untrue.
 *
 * A draft stops being a draft the moment its token is deployed: `removeDraftBySymbol` drops it and the
 * strip reads the real thing from the chain instead (see `onchain.ts`).
 */
export interface DraftLaunch extends StripItem {
  id: string;
  at: number;
  /**
   * The rest of the form, so reopening the page reopens the launch where it was left.
   *
   * `projectUrl` and `vaultBps` used to live here and no longer do: the project link field is gone, and
   * the vault share is a constant rather than a control. Drafts saved by an older build still carry
   * both keys; nothing reads them, so they are ignored rather than migrated.
   */
  form?: {
    imageUrl?: string;
    description?: string;
    website?: string;
    x?: string;
    pairedToken?: string;
    devBuyEth?: string;
  };
}

const KEY = "ponsfund:drafts";
const EVENT = "ponsfund:drafts-changed";
export const MAX_DRAFTS = 6;

export function readDrafts(): DraftLaunch[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((d) => d && typeof d.name === "string" && typeof d.symbol === "string").slice(0, MAX_DRAFTS);
  } catch {
    // Private mode, cleared storage, or something else wrote to the key. An empty list is the right answer.
    return [];
  }
}

/** Newest first, capped. Returns false when storage refuses the write (quota, private mode). */
export function addDraft(draft: Omit<DraftLaunch, "id" | "at">): boolean {
  const entry: DraftLaunch = { ...draft, id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`, at: Date.now() };
  const next = [entry, ...readDrafts()].slice(0, MAX_DRAFTS);
  return write(next);
}

export function removeDraft(id: string): boolean {
  return write(readDrafts().filter((d) => d.id !== id));
}

/** Called once a token is live: the chain now says what the draft was guessing at. */
export function removeDraftBySymbol(symbol: string): boolean {
  const key = symbol.trim().toUpperCase();
  const kept = readDrafts().filter((d) => d.symbol.trim().toUpperCase() !== key);
  return kept.length === readDrafts().length ? true : write(kept);
}

function write(list: DraftLaunch[]): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    return false;
  }
  window.dispatchEvent(new CustomEvent(EVENT));
  return true;
}

/** Fires for this tab (custom event) and for the site's other tabs (storage event). */
export function subscribeDrafts(fn: () => void): () => void {
  const onStorage = (e: StorageEvent) => {
    if (e.key === null || e.key === KEY) fn();
  };
  window.addEventListener(EVENT, fn);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(EVENT, fn);
    window.removeEventListener("storage", onStorage);
  };
}
