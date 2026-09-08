import {
  createWalletClient,
  custom,
  parseAbi,
  parseEther,
  parseUnits,
  type Account,
  type Chain as ViemChain,
  type Transport,
  type WalletClient,
} from "viem";
import { NATIVE_PAIR, PONS, launchChain, launchpadAddress, publicClient } from "./chain";
import { ZERO_ADDRESS, isRealAddress, pairDecimalsAt, platform } from "./config";
import type { Eip1193 } from "./wallet";

/**
 * Turning the launch form into a Pons V2 launch, through PonsFund's own launchpad.
 *
 * This replaces `lib/clanker.ts`. PonsFund used to deploy through the Clanker v4 SDK, which works --
 * Clanker's factory is live on Robinhood Chain -- but Clanker and Pons are unrelated protocols with
 * different curves, fee models and escrows, and PonsFund's launches have to be Pons launches.
 *
 * Nothing here reads the DOM. It takes a plain object, returns arguments, and the caller signs.
 *
 * ⭐⭐ Every launch goes through `PonsFundLaunchpad`, never straight at Pons's factory. The launchpad
 * overwrites the fee fields with the treasury's address, so the site cannot send a launch whose fees
 * point somewhere else even if this file had a bug. The guarantee lives in the contract, not here.
 *
 * The chain, the read client and Pons's addresses live in `chain.ts`; see the note there for why.
 */

export { NATIVE_PAIR, PONS, launchChain, launchpadAddress, publicClient };

/* --------------------------------------------------------------------------- abis -- */

/**
 * Hand-written and minimal, rather than a generated artifact.
 *
 * The alternative is importing the Foundry build output, which couples the site's build to the
 * contracts package and ships several kilobytes of ABI for the four functions actually called.
 * These four signatures are the whole surface this file touches.
 */
const LAUNCHPAD_ABI = parseAbi([
  "struct Socials { string twitter; string telegram; string discord; string website; string farcaster; }",
  "struct LaunchParams { string name; string symbol; string logo; string description; Socials socials; address creatorFeeRecipient; uint16 creatorTaxBps; bool buybackEnabled; bytes32 expectedEconomics; bytes32 salt; }",
  "function launch(LaunchParams params, uint256 launchConfigId, address pairToken, uint256 devBuyQuoteIn, uint256 minTokensOut) payable returns (address token, address curve)",
  "function launchCount() view returns (uint256)",
  "function treasury() view returns (address)",
]);

const FACTORY_ABI = parseAbi([
  "function launchEnabled() view returns (bool)",
  "function launchFee() view returns (uint256)",
]);

/* --------------------------------------------------------------------------- form -- */

export interface LaunchForm {
  name: string;
  symbol: string;
  /** Public https URL. Pons stores the string on chain; it cannot host a file. */
  imageUrl: string;
  description: string;
  website: string;
  /** An @handle or a full URL; normalised here. */
  x: string;
  /** Address of the asset the curve is denominated in. `NATIVE_PAIR` for ETH. */
  pairedToken: string;
  /** Optional first buy by the launcher, in the pair asset's units. "" or "0" = none. */
  devBuyEth: string;
}

export class LaunchConfigError extends Error {}

/** Pons's launch configuration to use. One config today; exposed so it is not a bare literal below. */
const LAUNCH_CONFIG_ID = 0n;

function socialsFor(form: LaunchForm) {
  const site = form.website.trim();
  const handle = form.x
    .trim()
    .replace(/^@/, "")
    .replace(/^https?:\/\/(www\.)?(x|twitter)\.com\//i, "");
  return {
    twitter: handle ? `https://x.com/${handle}` : "",
    telegram: "",
    discord: "",
    website: /^https?:\/\//i.test(site) ? site : "",
    farcaster: "",
  };
}

/**
 * Build the launch arguments.
 *
 * Throws `LaunchConfigError` with a sentence a visitor can act on, rather than letting a revert
 * selector surface -- and refuses outright while the launchpad is not deployed, which would
 * otherwise be a transaction sent at nothing.
 *
 * ⚠ `creatorFeeRecipient`, `creatorTaxBps` and `buybackEnabled` are sent as zero values on purpose.
 * The launchpad overwrites all three, and `expectedEconomics` too -- putting a real-looking value
 * here would suggest this file decides them.
 */
export function buildLaunch(form: LaunchForm) {
  if (!isRealAddress(launchpadAddress)) {
    throw new LaunchConfigError("The PonsFund launchpad is not deployed yet.");
  }

  const name = form.name.trim();
  const symbol = form.symbol.trim().toUpperCase();
  if (name.length < 2 || name.length > 24) throw new LaunchConfigError("Name must be 2 to 24 characters.");
  if (!/^[A-Z]{3,8}$/.test(symbol)) throw new LaunchConfigError("Symbol must be 3 to 8 letters.");

  const logo = form.imageUrl.trim();
  if (logo && !/^https:\/\//i.test(logo)) throw new LaunchConfigError("Image URL must start with https://.");

  // Not `isAddress`: the zero address is the native pair and must pass. See NATIVE_PAIR.
  if (!/^0x[0-9a-fA-F]{40}$/.test(form.pairedToken)) {
    throw new LaunchConfigError("Choose a paired asset.");
  }

  const params = {
    name,
    symbol,
    logo,
    description: form.description.trim().slice(0, 280),
    socials: socialsFor(form),
    // A placeholder, and the launchpad overwrites it. Written as ZERO_ADDRESS rather than
    // NATIVE_PAIR: both are the zero address, but this field is a recipient, not a pair asset,
    // and naming it after the pair constant reads as a copy-paste mistake.
    creatorFeeRecipient: ZERO_ADDRESS as `0x${string}`,
    creatorTaxBps: 0,
    buybackEnabled: false,
    expectedEconomics: `0x${"0".repeat(64)}` as `0x${string}`,
    /* A salt derived from the name and the ticker, so two launches of the same token from the same
       wallet do not collide, and a retry of the same launch is the same address. */
    salt: keccakSalt(`${name}:${symbol}`),
  };

  let devBuy = 0n;
  const typed = form.devBuyEth.trim();
  if (typed && Number(typed) > 0) {
    devBuy = parseUnits(typed, pairDecimalsAt(form.pairedToken));
  }

  return { params, pairToken: form.pairedToken as `0x${string}`, devBuy };
}

/** A deterministic 32-byte salt from a string, without pulling in a hashing dependency. */
function keccakSalt(s: string): `0x${string}` {
  // FNV-1a over the string, spread across 32 bytes. Not a cryptographic hash and does not need to
  // be: Pons uses the salt only to vary the CREATE2 address, and collisions revert visibly.
  let h = 0x811c9dc5;
  const bytes: number[] = [];
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  for (let i = 0; i < 32; i++) {
    bytes.push((h >>> (i % 4) * 8) & 0xff);
    h = Math.imul(h ^ (i + 1), 0x01000193) >>> 0;
  }
  return `0x${bytes.map((b) => b.toString(16).padStart(2, "0")).join("")}` as `0x${string}`;
}

/* ------------------------------------------------------------------------- signer -- */

export type Signer = WalletClient<Transport, ViemChain, Account>;

/** Wrap the browser's injected provider. Built per call, so a changed account is never signed for. */
export function signerFor(provider: Eip1193, address: `0x${string}`): Signer {
  return createWalletClient({ account: address, chain: launchChain, transport: custom(provider) });
}

/* --------------------------------------------------------------------------- reads -- */

export async function launchesOpen(): Promise<boolean> {
  return publicClient.readContract({
    address: PONS.factory,
    abi: FACTORY_ABI,
    functionName: "launchEnabled",
  });
}

/**
 * Pons's launch fee, in wei.
 *
 * ⚠⚠ Read live and never guessed. `msg.value` must be EXACT -- Pons checks `launchFee + quoteIn`
 * for a native pair and `launchFee` alone otherwise, and reverts on anything else. There is no slack
 * and no tip. It was 0.0005 ETH on 2026-09-08, which is why that number is not written down here.
 */
export async function launchFee(): Promise<bigint> {
  return publicClient.readContract({
    address: PONS.factory,
    abi: FACTORY_ABI,
    functionName: "launchFee",
  });
}

/* -------------------------------------------------------------------------- write -- */

function valueFor(fee: bigint, pairToken: string, devBuy: bigint): bigint {
  // The buy is only paid in native value when the pair asset IS native. An ERC-20 pair takes the
  // launch fee alone, and the tokens come from an allowance.
  return pairToken.toLowerCase() === NATIVE_PAIR ? fee + devBuy : fee;
}

/** Dry run against the node. Throws whatever the chain would reject, before a wallet is opened. */
export async function simulate(form: LaunchForm, launcher: `0x${string}`) {
  const { params, pairToken, devBuy } = buildLaunch(form);
  const fee = await launchFee();
  return publicClient.simulateContract({
    address: launchpadAddress as `0x${string}`,
    abi: LAUNCHPAD_ABI,
    functionName: "launch",
    args: [params, LAUNCH_CONFIG_ID, pairToken, devBuy, 0n],
    value: valueFor(fee, pairToken, devBuy),
    account: launcher,
  });
}

/** Send it. Returns the transaction hash; the caller waits for the receipt. */
export async function launch(form: LaunchForm, signer: Signer): Promise<`0x${string}`> {
  const { params, pairToken, devBuy } = buildLaunch(form);
  const fee = await launchFee();
  return signer.writeContract({
    address: launchpadAddress as `0x${string}`,
    abi: LAUNCHPAD_ABI,
    functionName: "launch",
    args: [params, LAUNCH_CONFIG_ID, pairToken, devBuy, 0n],
    value: valueFor(fee, pairToken, devBuy),
    chain: launchChain,
    account: signer.account,
  });
}

/** Wait for the block and pull the launched token out of our launchpad's own event. */
export async function waitForLaunch(hash: `0x${string}`) {
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error("The launch transaction reverted.");
  /* `Launched(address indexed token, address indexed curve, address indexed launcher, ...)`. The
     token is the first indexed field, so it is topic 1 -- decoded by hand rather than pulling in
     the event ABI, which is one more thing to keep in step with the contract. */
  const log = receipt.logs.find(
    (l) => l.address.toLowerCase() === (launchpadAddress ?? "").toLowerCase() && l.topics.length >= 4,
  );
  const token = log?.topics[1] ? (`0x${log.topics[1].slice(-40)}` as `0x${string}`) : null;
  return { receipt, token };
}

/** Kept for the copy that quotes a starting market cap. Pons prices the curve, not this site. */
export const initialMarketCapWei = parseEther(platform.initialMarketCapEth ?? "5");
