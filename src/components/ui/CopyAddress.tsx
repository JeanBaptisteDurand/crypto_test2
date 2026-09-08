import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { config, shortAddress } from "../../lib/config";

export default function CopyAddress({ full = false }: { full?: boolean }) {
  const [copied, setCopied] = useState(false);
  const ca = config.token.contractAddress;

  if (!ca) {
    return (
      <span className="glass inline-flex items-center gap-2.5 px-4 py-2.5 font-mono text-xs text-muted">
        <span className="caret inline-block h-2 w-2 bg-accent" />
        Contract address revealed at launch
      </span>
    );
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(ca);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard unavailable, nothing to do */
    }
  };

  return (
    <button
      onClick={copy}
      className="glass inline-flex max-w-full items-center gap-2.5 px-4 py-2.5 font-mono text-xs text-accent3 transition hover:bg-accent3/15"
      title="Copy contract address"
    >
      <span className="truncate">{full ? ca : shortAddress(ca)}</span>
      {copied ? <Check className="h-3.5 w-3.5 text-accent" /> : <Copy className="h-3.5 w-3.5 text-accent3" />}
    </button>
  );
}
