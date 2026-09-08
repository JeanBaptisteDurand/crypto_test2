import { useCallback, useEffect, useMemo, useState } from "react";
import { CHAINS, config } from "./config";

/**
 * The wallet, in the smallest form that can sign a launch.
 *
 * Injected provider only (MetaMask and anything else that puts an EIP-1193 object on `window.ethereum`).
 * No WalletConnect: it is a project id, a relay, a modal and ~200 KB of bundle, and this page has one
 * transaction to send. If a visitor has no injected wallet the form says so rather than half-working.
 *
 * Nothing here imports viem. Connecting, reading the chain and switching chains are four `request` calls
 * against the provider the browser already has, so the library that signs stays in the lazily loaded
 * deploy chunk (`pons.ts`), and a visitor who never opens the form never downloads it.
 */

export const launchChainInfo = CHAINS[config.token.chain];
export const launchChainId = launchChainInfo.id;

export interface Eip1193 {
  request(args: { method: string; params?: unknown[] | object }): Promise<unknown>;
  on?(event: string, fn: (...args: never[]) => void): void;
  removeListener?(event: string, fn: (...args: never[]) => void): void;
  isMetaMask?: boolean;
  providers?: Eip1193[];
}

/** MetaMask when several extensions fight over `window.ethereum`, otherwise whatever is there. */
export function injectedProvider(): Eip1193 | null {
  const eth = (globalThis as { ethereum?: Eip1193 }).ethereum;
  if (!eth) return null;
  if (Array.isArray(eth.providers)) return eth.providers.find((p) => p.isMetaMask) ?? eth.providers[0] ?? null;
  return eth;
}

export type WalletStatus = "no-wallet" | "disconnected" | "connecting" | "connected";

export interface WalletState {
  status: WalletStatus;
  address: `0x${string}` | null;
  chainId: number | null;
  /** True once connected and on the chain this launch deploys to. */
  onLaunchChain: boolean;
  error: string | null;
  /** The raw provider, for the deploy module to wrap in a viem wallet client. */
  provider: Eip1193 | null;
  connect: () => Promise<void>;
  switchToLaunchChain: () => Promise<void>;
}

export function useWallet(): WalletState {
  const provider = useMemo(injectedProvider, []);
  const [address, setAddress] = useState<`0x${string}` | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reconnect silently if this browser already granted the site an account. `eth_accounts` never prompts.
  useEffect(() => {
    if (!provider) return;
    let live = true;
    const read = async () => {
      try {
        const accounts = (await provider.request({ method: "eth_accounts" })) as string[];
        const id = (await provider.request({ method: "eth_chainId" })) as string;
        if (!live) return;
        setAddress((accounts?.[0] as `0x${string}`) ?? null);
        setChainId(Number.parseInt(id, 16));
      } catch {
        /* a locked or hostile provider: the form stays in its disconnected state */
      }
    };
    void read();
    const onAccounts = (...args: never[]) => setAddress(((args[0] as string[])?.[0] as `0x${string}`) ?? null);
    const onChain = (...args: never[]) => setChainId(Number.parseInt(args[0] as string, 16));
    provider.on?.("accountsChanged", onAccounts);
    provider.on?.("chainChanged", onChain);
    return () => {
      live = false;
      provider.removeListener?.("accountsChanged", onAccounts);
      provider.removeListener?.("chainChanged", onChain);
    };
  }, [provider]);

  const connect = useCallback(async () => {
    if (!provider) return;
    setConnecting(true);
    setError(null);
    try {
      const accounts = (await provider.request({ method: "eth_requestAccounts" })) as string[];
      setAddress((accounts?.[0] as `0x${string}`) ?? null);
      const id = (await provider.request({ method: "eth_chainId" })) as string;
      setChainId(Number.parseInt(id, 16));
    } catch (e) {
      setError(walletError(e));
    } finally {
      setConnecting(false);
    }
  }, [provider]);

  const switchToLaunchChain = useCallback(async () => {
    if (!provider) return;
    setError(null);
    const hex = `0x${launchChainId.toString(16)}`;
    try {
      await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: hex }] });
    } catch (e) {
      // 4902: the wallet does not know this chain yet. Offer to add it from the site's own chain table.
      if ((e as { code?: number }).code !== 4902) {
        setError(walletError(e));
        return;
      }
      try {
        await provider.request({
          method: "wallet_addEthereumChain",
          params: [
            {
              chainId: hex,
              chainName: launchChainInfo.label,
              nativeCurrency: launchChainInfo.currency,
              rpcUrls: [launchChainInfo.rpc],
              blockExplorerUrls: [launchChainInfo.explorer],
            },
          ],
        });
      } catch (addError) {
        setError(walletError(addError));
      }
    }
  }, [provider]);

  const status: WalletStatus = !provider
    ? "no-wallet"
    : connecting
      ? "connecting"
      : address
        ? "connected"
        : "disconnected";

  return {
    status,
    address,
    chainId,
    onLaunchChain: chainId === launchChainId,
    error,
    provider,
    connect,
    switchToLaunchChain,
  };
}

/** Wallet errors arrive in four shapes. This picks the one line worth showing. */
export function walletError(e: unknown): string {
  const err = e as { code?: number; shortMessage?: string; details?: string; message?: string };
  if (err?.code === 4001) return "Rejected in the wallet.";
  const raw = err?.shortMessage || err?.details || err?.message || String(e);
  return raw.split("\n")[0].slice(0, 220);
}
