import raw from "../../launch.config.json";

export type ShaderPreset = "aurora" | "liquid" | "grid" | "particles" | "noise" | "pixel" | "dither";
export type Chain = "base" | "base-sepolia" | "robinhood";
export type HeroComposition = "editorial-3d" | "centered" | "editorial" | "split-image";
export type MascotStyle = "auto" | "glb" | "coin" | "image" | "none";

/** One entry of the launches strip at the bottom of the hero. */
export interface StripItem {
  name: string;
  symbol: string;
  status?: "scheduled" | "live" | "ended";
  note?: string;
  url?: string | null;
  image?: string | null;
}

/** One asset a launcher can pool their token against, with its address on each chain. */
export interface PairedAsset {
  symbol: string;
  label?: string;
  /**
   * ⛔⛔ LOAD-BEARING, AND USDG IS 6. The market cap arithmetic divides the token's decimals out but
   * NOT the pair's, so a wrong number here is silently wrong by a factor of a trillion against USDG
   * -- a plausible, positive figure. Same for a developer buy, which is denominated in this asset.
   * Defaults to 18 when absent, which is right for native ETH and for every tokenised equity Pons
   * approves.
   */
  decimals?: number;
  addresses: Partial<Record<Chain, string>>;
}

/**
 * Launchpad economics for tokens visitors create through the launch form.
 * Every number and every address the form writes into a launch comes from here, so the component
 * holds no hex and no basis point of its own.
 */
export interface PlatformConfig {
  /**
   * `PonsFundLaunchpad`, our own contract. Null until it is deployed, and the form refuses to launch
   * while it is -- a transaction sent at nothing costs gas and creates no token.
   *
   * Pons's own addresses are NOT here: the factory and the router are protocol constants that
   * describe the chain rather than this launch, and they live in `lib/pons.ts`.
   */
  launchpad?: string | null;
  treasury: string;
  feeBps: number;
  minVaultBps: number;
  maxCreatorTaxBps?: number;
  launchFeeEth?: string;
  /** Block the launchpad started at; the launches list reads the chain from here on. See onchain.ts. */
  launchesFromBlock?: number;
  /** Pons charges one fee per swap, on the quote leg, before and after graduation. */
  tradingFeeBps?: { swap: number };
  sniper?: { startingPercent: number; endingPercent: number; secondsToDecay: number };
  initialMarketCapEth?: string;
  pairedAssets: PairedAsset[];
}

export interface LaunchConfig {
  slug: string;
  token: {
    name: string;
    symbol: string;
    tagline: string;
    description: string;
    chain: Chain;
    contractAddress: string | null;
    image: string;
    totalSupply: string;
    decimals: number;
  };
  links: {
    x: string | null;
    telegram: string | null;
    website: string | null;
    dexscreener: string | null;
    basescan: string | null;
    uniswap: string | null;
  };
  tokenomics: { label: string; percent: number; note?: string }[];
  roadmap: { phase: string; title: string; items: string[] }[];
  faq: { q: string; a: string }[];
  design: {
    background: "shader" | "video" | "gradient";
    shaderPreset?: ShaderPreset;
    videoUrl: string | null;
    videoPoster: string | null;
    /** Picture the shader reads (dither preset). Its luminance becomes the field. */
    backgroundImage?: string | null;
    palette: { bg: string; fg: string; accent: string; accent2?: string; accent3?: string; muted?: string };
    font: { display: string; body: string; mono?: string; pixel?: string };
    radius?: string;
    vibe?: string;
  };
  /** Files the user provided (imported by scripts/import-assets.py from launches/<slug>/assets/user/). */
  assets?: {
    logo?: string | null;
    mascot3d?: string | null;
    bgVideo?: string | null;
    heroImage?: string | null;
    banner?: string | null;
  };
  /** Hero layout. Default: text left, 3D token mascot right, launches strip at the bottom. */
  hero?: {
    composition?: HeroComposition;
    mascot?: MascotStyle;
    /** Shown above the headline. Default: token name. Use for a punchline when the name is in the navbar already. */
    headline?: string | null;
    /** Three short lines under the tagline (how it works). Optional. */
    points?: string[];
    /** Coins orbiting the 3D chest, one per logo. Order maps to the orbit rings in TokenScene. */
    coins?: { image: string; metal?: "gold" | "silver" }[];
  };
  /** The scrolling strip of tokens (platform launches, previous launches, partners). */
  strip?: {
    title?: string;
    items: StripItem[];
  };
  /** The shared vault every launch pays into. Null fields render as "not yet". */
  vault?: {
    address: string | null;
    cycleHours: number;
    firstPayoutAt: string | null;
    label: string;
  };
  /** Launchpad economics for the visitor-facing launch form. See PlatformConfig. */
  platform?: PlatformConfig;
  /** First-distribution draw. Every field is displayed verbatim; none may imply a guaranteed return. */
  giveaway?: {
    enabled: boolean;
    share: string;
    winners: number;
    minHold: string;
    snapshotBlock?: string | null;
    drawTx?: string | null;
    payoutTx?: string | null;
  };
  /** Tokens launched through this platform. Drives the launches strip. */
  platformLaunches?: {
    slug: string;
    name: string;
    symbol: string;
    /** Share of the creator fee routed to the vault, in basis points. */
    feeToVaultBps: number;
    scheduledAt?: string | null;
    contractAddress?: string | null;
    url?: string | null;
  }[];
  launch: {
    network: Chain;
    creatorWallet: string;
    creatorRewardBps?: number;
    feeVault?: { address: string; bps: number; label?: string };
    vault?: { enabled: boolean; percentage: number; lockupDays: number; vestingDays: number };
    devBuy?: { enabled: boolean; ethAmount: string };
    initialMarketCapEth?: string;
  };
}

export const config = raw as unknown as LaunchConfig;

/** The burn address, and this site's stand-in for "this is not configured yet". */
export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

/**
 * Owner's decision (2026-09-06): the hero animates for everyone, including visitors whose system asks for
 * reduced motion. Set to true to honour the setting again -- both the shader background and the 3D scene
 * read it from here, so it is the only line to change.
 *
 * What it costs: that setting is how people who get motion sickness or vestibular symptoms ask sites to
 * stop moving. Overriding it means they get the animation anyway.
 */
export const RESPECT_REDUCED_MOTION = false;

export interface ChainInfo {
  id: number;
  label: string;
  explorer: string;
  explorerName: string;
  mainnet: boolean;
  /** Public RPC. Used to read the chain, and to describe it to a wallet that does not know it yet. */
  rpc: string;
  currency: { name: string; symbol: string; decimals: number };
  /**
   * This chain's slug on gmgn.ai, where a token's chart and trading live. Absent when gmgn does not
   * cover the chain, and the link is then not rendered at all rather than pointing at a 404.
   *
   * ⚠ Verified on 2026-09-08 against live tokens: `gmgn.ai/robinhood/token/0x…` resolves, and
   * Robinhood Chain is one of the chains gmgn lists (sol, bsc, base, eth, robinhood, arc, stable).
   * Testnets are not covered, which is why `base-sepolia` has none.
   */
  gmgnSlug?: string;
}

const ETH = { name: "Ether", symbol: "ETH", decimals: 18 };

export const CHAINS: Record<Chain, ChainInfo> = {
  base: {
    id: 8453,
    label: "Base",
    explorer: "https://basescan.org",
    explorerName: "Basescan",
    mainnet: true,
    rpc: "https://mainnet.base.org",
    currency: ETH,
    gmgnSlug: "base",
  },
  "base-sepolia": {
    id: 84532,
    label: "Base Sepolia",
    explorer: "https://sepolia.basescan.org",
    explorerName: "Basescan",
    mainnet: false,
    rpc: "https://sepolia.base.org",
    currency: ETH,
  },
  robinhood: {
    id: 4663,
    label: "Robinhood Chain",
    explorer: "https://robinhoodchain.blockscout.com",
    explorerName: "Blockscout",
    mainnet: true,
    rpc: "https://rpc.mainnet.chain.robinhood.com",
    currency: ETH,
    gmgnSlug: "robinhood",
  },
};

/** Links derived from the contract address when the config leaves them null. */
export function derivedLinks(c: LaunchConfig = config) {
  const ca = c.token.contractAddress;
  const chain = CHAINS[c.token.chain];
  const onBase = c.token.chain === "base";
  return {
    // Explorer link works on every chain. Uniswap and Dexscreener deep links are only derived on Base:
    // for other chains set links.uniswap / links.dexscreener explicitly in the config once you know the URLs.
    basescan: c.links.basescan ?? (ca ? `${chain.explorer}/token/${ca}` : null),
    dexscreener: c.links.dexscreener ?? (ca && onBase ? `https://dexscreener.com/base/${ca}` : null),
    uniswap:
      c.links.uniswap ?? (ca && onBase ? `https://app.uniswap.org/swap?chain=base&outputCurrency=${ca}` : null),
    x: c.links.x,
    telegram: c.links.telegram,
    website: c.links.website,
  };
}

/**
 * Primary buy link: Uniswap if live, otherwise null (UI shows "Coming soon").
 *
 * ⚠ The Clanker fallback is gone with Clanker. On Robinhood Chain neither link is derived, because
 * a launch trades on its Pons curve before it graduates and the deep links differ -- set
 * `links.uniswap` explicitly once the token has a pool, or leave it null and let the UI say so.
 */
export function buyLink(c: LaunchConfig = config): string | null {
  const l = derivedLinks(c);
  return l.uniswap ?? null;
}

export const isLive = Boolean(config.token.contractAddress);

export function shortAddress(a: string) {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

/**
 * A token's page on gmgn.ai, where its chart and trading live.
 *
 * Null when this chain has no gmgn slug, and the link is then not rendered. Null rather than a best
 * guess: a trading link that lands on "chain not supported" is worse than no trading link, because a
 * visitor reads it as the token being broken rather than the link.
 */
export function gmgnTokenUrl(address: string, chain: Chain = config.token.chain): string | null {
  const slug = CHAINS[chain].gmgnSlug;
  return slug ? `https://gmgn.ai/${slug}/token/${address}` : null;
}

/** Chain ids, the one place the site maps its chain names onto the numbers viem wants. */
export const CHAIN_IDS: Record<Chain, number> = {
  base: CHAINS.base.id,
  "base-sepolia": CHAINS["base-sepolia"].id,
  robinhood: CHAINS.robinhood.id,
};

/**
 * Launchpad economics, with the defaults the launch form falls back to when the config leaves `platform`
 * out. The zero treasury is deliberate: the form reads it as "not configured yet" and refuses to launch
 * rather than sending a tenth of someone's fees to the burn address.
 */
export const platform: PlatformConfig = {
  launchpad: null,
  treasury: ZERO_ADDRESS,
  feeBps: 1000,
  minVaultBps: 5000,
  maxCreatorTaxBps: 4000,
  launchFeeEth: "0",
  launchesFromBlock: 0,
  tradingFeeBps: { swap: 100 },
  sniper: { startingPercent: 66.6777, endingPercent: 4.1673, secondsToDecay: 15 },
  initialMarketCapEth: "5",
  pairedAssets: [],
  ...(config.platform ?? {}),
};

/** Basis points → a percentage string with no trailing zeros ("1000" → "10", "1250" → "12.5"). */
export function bpsToPercent(bps: number): string {
  return String(Math.round(bps * 100) / 100 / 100);
}

/**
 * The vault share floor, in bps. Two config keys can raise it and the stricter one wins:
 * `minVaultBps` sets it directly, and `maxCreatorTaxBps` sets it from the other end -- the three reward
 * recipients (vault, platform, launcher) always sum to 10000, so capping the launcher's share is the same
 * statement as flooring the vault's.
 */
export function vaultFloorBps(p: PlatformConfig = platform): number {
  const fromCreatorCap = p.maxCreatorTaxBps == null ? 0 : 10_000 - p.feeBps - p.maxCreatorTaxBps;
  return Math.min(10_000 - p.feeBps, Math.max(0, p.minVaultBps, fromCreatorCap));
}

/** Paired assets that have an address on `chain`. Those that do not are still listed, marked unavailable. */
export function pairedAssetsFor(chain: Chain = config.token.chain, p: PlatformConfig = platform) {
  return p.pairedAssets.map((a) => ({ ...a, address: a.addresses[chain] ?? null }));
}

/**
 * The pair asset at `address`, by its address on the launch chain.
 *
 * ⚠ Case-insensitive. Addresses reach this from three places -- the config, a form field and a
 * contract read -- and they do not agree on checksum casing.
 */
export function pairAssetAt(address: string, chain: Chain = config.token.chain): PairedAsset | null {
  const want = address.toLowerCase();
  return platform.pairedAssets.find((a) => (a.addresses[chain] ?? "").toLowerCase() === want) ?? null;
}

/** Decimals of the pair asset at `address`. 18 unless the config says otherwise. See PairedAsset. */
export function pairDecimalsAt(address: string, chain: Chain = config.token.chain): number {
  return pairAssetAt(address, chain)?.decimals ?? 18;
}

/** Ticker of the pair asset at `address`, for labelling an amount denominated in it. */
export function pairSymbolAt(address: string, chain: Chain = config.token.chain): string {
  return pairAssetAt(address, chain)?.symbol ?? "";
}

export function isAddress(v: unknown): v is `0x${string}` {
  return typeof v === "string" && /^0x[0-9a-fA-F]{40}$/.test(v);
}

/** An address that is set to something other than the burn address. */
export function isRealAddress(v: unknown): v is `0x${string}` {
  return isAddress(v) && v.toLowerCase() !== ZERO_ADDRESS;
}
