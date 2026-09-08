import { useEffect, useState } from "react";
import { config, type StripItem } from "./config";
import { readDrafts, subscribeDrafts } from "./drafts";
import { invalidateChainLaunches, loadChainLaunches, subscribeChainLaunches, type ChainLaunch } from "./onchain";

export interface StripEntry extends StripItem {
  /** Made in this browser by the launch form and not signed. Never presented as a deployed token. */
  draft?: boolean;
  id?: string;
}

/** The tokens the chain reports as launched through this site, plus a way to ask again after a deploy. */
export function useChainLaunches(): { items: ChainLaunch[]; loading: boolean; refresh: () => void } {
  const [items, setItems] = useState<ChainLaunch[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let live = true;
    const read = () => {
      setLoading(true);
      void loadChainLaunches().then((next) => {
        if (!live) return;
        setItems(next);
        setLoading(false);
      });
    };
    read();
    // A deploy elsewhere on the page invalidates the list; this is how the strip and the table hear it.
    const unsubscribe = subscribeChainLaunches(read);
    return () => {
      live = false;
      unsubscribe();
    };
  }, []);

  return { items, loading, refresh: invalidateChainLaunches };
}

/**
 * What the launches strip shows, from three sources that answer at different speeds:
 *   1. this visitor's drafts, first, because someone who just made one wants to see it;
 *   2. the tokens the chain reports as launched through PonsFund, which arrive a moment later;
 *   3. the tokens the config lists by hand (the satellites), for the ones that have not launched yet.
 * Deduplicated by symbol, first source wins. The chain comes before the config on purpose: a token
 * announced as "scheduled" in the config and since deployed should read "live", and the chain is the one
 * of the two that knows.
 */
export function useLaunches(): StripEntry[] {
  const [drafts, setDrafts] = useState<StripEntry[]>([]);
  const { items: chain } = useChainLaunches();

  useEffect(() => {
    const sync = () => setDrafts(readDrafts().map((d) => ({ ...d, draft: true })));
    sync();
    return subscribeDrafts(sync);
  }, []);

  const seen = new Set<string>();
  const out: StripEntry[] = [];
  for (const item of [...drafts, ...chain, ...(config.strip?.items ?? [])]) {
    const key = item.symbol.trim().toUpperCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}
