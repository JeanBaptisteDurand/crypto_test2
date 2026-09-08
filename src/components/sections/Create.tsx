import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ExternalLink, Trash2, Wallet } from "lucide-react";
import {
  CHAINS,
  bpsToPercent,
  config,
  isRealAddress,
  pairedAssetsFor,
  platform,
} from "../../lib/config";
import {
  MAX_DRAFTS,
  addDraft,
  readDrafts,
  removeDraft,
  removeDraftBySymbol,
  subscribeDrafts,
  type DraftLaunch,
} from "../../lib/drafts";
import { invalidateChainLaunches } from "../../lib/onchain";
import { subscribeOpenCreate } from "../../lib/openCreate";
import { logoUploadAvailable, uploadLogo } from "../../lib/upload";
import { useWallet, walletError } from "../../lib/wallet";
import Section from "../ui/Section";

/** The mark is stored in the page's own storage, so it is redrawn small before it is kept. */
const MARK_SIZE = 96;
/** What a browser will decode and what the tile can hold. Bigger files are refused with a reason. */
const IMAGE_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp", "image/avif"];
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const MAX_DESCRIPTION = 280;
/**
 * The whole creator-side fee, to the treasury, on every launch made here.
 *
 * A constant and not a control: there is no launcher share and no platform share to trade it off
 * against, so there is nothing for a visitor to decide. `platform.minVaultBps` says the same thing in
 * the config. `PonsFundLaunchpad` overwrites the fee fields on chain, so this is a label, not a lever.
 */
const VAULT_BPS = 10_000;

/** The deploy module is loaded on demand: viem's ABI machinery has no business in the first paint. */
type PonsModule = typeof import("../../lib/pons");

async function toSmallDataUrl(file: File): Promise<string | null> {
  if (!file.type.startsWith("image/")) return null;
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    await new Promise((ok, fail) => {
      img.onload = ok;
      img.onerror = fail;
      img.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = MARK_SIZE;
    canvas.height = MARK_SIZE;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    // Nearest neighbour, like every other picture on this page: the art here is pixel art.
    ctx.imageSmoothingEnabled = false;
    const side = Math.min(img.width, img.height);
    ctx.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, MARK_SIZE, MARK_SIZE);
    return canvas.toDataURL("image/webp", 0.85);
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

const cleanSymbolOf = (s: string) => s.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 8);

/**
 * Wei → a short ETH string, without pulling viem into the first paint.
 *
 * `formatEther` lives in the deploy module, which is loaded on demand; importing it here for one
 * label would drag viem into the initial bundle. Six decimals is enough for a launch fee measured
 * in ten-thousandths of an ETH.
 */
function formatEth(wei: bigint): string {
  const s = (Number(wei) / 1e18).toFixed(6).replace(/0+$/, "").replace(/\.$/, "");
  return s === "" ? "0" : s;
}

/**
 * The launch form.
 *
 * This one signs. Filling it in changes nothing anywhere -- the draft it can save is a `localStorage`
 * entry that only this browser reads -- but the Launch button at the bottom sends a deployment from the
 * visitor's own wallet, and what it writes cannot be changed afterwards: the fee destination and the
 * asset the pool is denominated in are fixed at launch, and no setter exists for either.
 *
 * There is one term and it is not a choice: **the whole creator-side fee goes to the PonsFund treasury.**
 * There is no launcher share and no platform share, so there is nothing to divide and no slider to
 * divide it with. That is why this form has no Terms section in the sense other launchpads have one.
 *
 * Every number and address it deploys comes from `launch.config.json → platform` and `vault.address`.
 * There is no hex in this file, and the form refuses to launch while the treasury is still a placeholder.
 */
export default function Create() {
  const chain = config.token.chain;
  const explorer = CHAINS[chain];
  const assets = useMemo(() => pairedAssetsFor(chain), [chain]);

  const [open, setOpen] = useState(false);
  const [advanced, setAdvanced] = useState(false);
  const [pons, setPons] = useState<PonsModule | null>(null);
  /** Pons's launch fee, read live. `null` until the module has answered; never guessed. */
  const [fee, setFee] = useState<bigint | null>(null);

  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [mark, setMark] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState("");
  const [description, setDescription] = useState("");
  const [website, setWebsite] = useState("");
  const [x, setX] = useState("");
  const [pairedToken, setPairedToken] = useState(assets.find((a) => a.address)?.address ?? "");
  const [devBuyEth, setDevBuyEth] = useState("");

  const [drafts, setDrafts] = useState<DraftLaunch[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [deployed, setDeployed] = useState<{ address: string; symbol: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  /** null while the probe is out, then whether this deployment can actually store an image. */
  const [canUpload, setCanUpload] = useState<boolean | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const wallet = useWallet();

  useEffect(() => {
    const sync = () => setDrafts(readDrafts());
    sync();
    return subscribeDrafts(sync);
  }, []);

  // Closed until asked for: the hero's Create your own, the navbar's Make one, or a link to #create.
  useEffect(() => subscribeOpenCreate(() => setOpen(true)), []);

  /* Asked once, when the form opens. The drop zone only promises an upload if something answered
     yes -- offering one on a static host produces "the upload failed (405)" shown to somebody who
     did nothing wrong. */
  useEffect(() => {
    if (!open || canUpload !== null) return;
    let live = true;
    void logoUploadAvailable().then((ok) => live && setCanUpload(ok));
    return () => {
      live = false;
    };
  }, [open, canUpload]);

  // Opening the form is the signal that this visitor might sign something. The deploy module arrives
  // then, not on page load, and the Launch button reports "Preparing…" for the moment it takes.
  useEffect(() => {
    if (!open || pons) return;
    let live = true;
    import("../../lib/pons").then((m) => live && setPons(m));
    return () => {
      live = false;
    };
  }, [open, pons]);

  /*
    The launch fee, read live because it is Pons's number and `msg.value` has to match it exactly.

    ⛔⛔ ITS OWN EFFECT, KEYED ON `open` ALONE, AND THAT IS THE WHOLE POINT. This read used to sit
    inside the effect above, which depends on `[open, pons]` -- so `setPons(m)` changed `pons`,
    React ran the cleanup, `live` went false, and the fee arrived a moment later to a closure that
    threw it away. The row sat on "—" forever and a `.catch(() => {})` made it look like a network
    problem. Found by watching it for twelve seconds against a local fork where the same call
    answers instantly from `cast`.
  */
  useEffect(() => {
    if (!open) return;
    let live = true;
    import("../../lib/pons")
      .then((m) => m.launchFee())
      .then((f) => live && setFee(f))
      /* Left as "—" rather than surfaced: the fee is one row of a summary card, and a visitor can
         still launch without it -- the value sent is read again at signing time, not from here. */
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [open]);

  const cleanName = name.trim().slice(0, 24);
  const cleanSymbol = cleanSymbolOf(symbol);
  const nameOk = cleanName.length >= 2;
  const symbolOk = cleanSymbol.length >= 3;
  /*
    Two addresses have to be real before this form can launch anything: the treasury the fees go to,
    and our own launchpad that names it. `platform.treasury` is deliberately NOT in the check -- at
    `feeBps: 0` nothing is ever routed there.

    ⚠ Note this is `isRealAddress`, which rejects the zero address. That is right for both of these
    and wrong for a pair asset, where zero means native ETH. See `NATIVE_PAIR` in `lib/pons.ts`.
  */
  const configured = isRealAddress(config.vault?.address) && isRealAddress(platform.launchpad);
  const formOk = nameOk && symbolOk && Boolean(pairedToken);

  const pairedLabel = assets.find((a) => a.address === pairedToken)?.symbol ?? "—";

  const pickImage = async (file: File | undefined) => {
    setImageError(null);
    if (!file) return;
    if (!IMAGE_TYPES.includes(file.type)) {
      setImageError("PNG, JPEG, GIF, WebP or AVIF only.");
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setImageError("That file is over 4 MB.");
      return;
    }
    const url = await toSmallDataUrl(file);
    if (!url) {
      setImageError("This browser could not read that image.");
      return;
    }
    setMark(url);

    /* ⛔⛔ THE PREVIEW IS NOT THE LAUNCH. `mark` is a 96px thumbnail in this browser's storage; what
       reaches the chain is `imageUrl`, a string with no setter afterwards. Without this upload the
       two are unrelated and a launcher who dropped a file would ship a token with no picture while
       looking at their logo on screen. */
    if (!canUpload) return;
    setUploading(true);
    try {
      const { url: hosted } = await uploadLogo(file);
      setImageUrl(hosted);
    } catch (e) {
      /* Cleared, never left half-written: the URL is permanent, so believing it worked is worse
         than knowing it did not. */
      setImageUrl("");
      setImageError(
        `${e instanceof Error ? e.message : "the upload failed"}. Nothing was uploaded, and the image link has been left empty rather than pointing at something that does not exist.`,
      );
    } finally {
      setUploading(false);
    }
  };

  const saveDraft = () => {
    if (!formOk) return;
    const ok = addDraft({
      name: cleanName,
      symbol: cleanSymbol,
      status: "scheduled",
      note: description.trim().slice(0, 40) || undefined,
      image: mark,
      url: null,
      form: { imageUrl, description, website, x, pairedToken, devBuyEth },
    });
    setMessage(
      ok
        ? `${cleanName} is saved in this browser. Nothing has been signed.`
        : "This browser refused to store it. Private window, maybe?",
    );
  };

  const launch = async () => {
    if (!pons || !formOk || !wallet.address || !wallet.provider) return;
    const signer = pons.signerFor(wallet.provider, wallet.address);
    const form = { name: cleanName, symbol: cleanSymbol, imageUrl, description, website, x, pairedToken, devBuyEth };
    setBusy(true);
    setDeployed(null);
    try {
      /* Pons can close its own pad, and it is not ours to reopen. Checked before the simulation so
         the message names the reason instead of surfacing a bare revert. */
      if (!(await pons.launchesOpen())) {
        setMessage("Pons has launches paused right now. Nothing was signed. Save a draft and try later.");
        return;
      }

      setMessage("Simulating the launch against the chain…");
      await pons.simulate(form, wallet.address);
      setMessage(`Simulation passed. Confirm the transaction in your wallet to launch $${cleanSymbol}.`);

      const hash = await pons.launch(form, signer);
      setMessage(`Sent. Waiting for the block: ${hash}`);
      const { token } = await pons.waitForLaunch(hash);
      if (!token) throw new Error("The launch landed but its address could not be read from the receipt.");

      setDeployed({ address: token, symbol: cleanSymbol });
      setMessage(`$${cleanSymbol} is live. The table reads it from the chain from here on.`);
      // The draft was a stand-in for this token. The chain has the real one now.
      removeDraftBySymbol(cleanSymbol);
      // The table is reading the old list; this is what tells it to look again.
      invalidateChainLaunches();
    } catch (e) {
      setMessage(
        e instanceof pons.LaunchConfigError ? e.message : `The launch did not go through. ${walletError(e)}`,
      );
    } finally {
      setBusy(false);
    }
  };

  const field = "w-full bg-bg/50 px-3.5 py-3 font-mono text-sm text-fg outline-none placeholder:text-muted/70";
  const fieldFrame = "pixel-frame block";
  const labelClass = "label-pixel text-[12px] text-muted";
  const required = <span className="label-pixel mt-1 block text-[11px] text-accent2">Required</span>;

  return (
    <Section
      id="create"
      eyebrow="Make one"
      title="Launch a token"
      subtitle={`Every launch made here sends its whole creator-side fee to the PonsFund treasury, and that destination is written into the contract at launch with no setter afterwards. The asset your pool is paired with is fixed the same way. Until you sign, everything here stays in this browser as a draft; the signature is the only part that goes on ${explorer.label}.`}
    >
      {/* The whole thing is behind one disclosure: this page is a board of launches first, and a
          twenty-field form standing open under it would bury the board. Closed is the resting state;
          it opens on a click here, or on the hero's Create your own, which asks for it by hand. */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="launch-form"
        className="panel flex w-full items-center gap-4 p-5 text-left"
      >
        {/* The menu selector, and it only moves while the row is closed: an arrow still nudging at a panel
            that is already open is pointing at nothing. Same two-frame idiom as the mascot's idle bob. */}
        <span
          aria-hidden
          className={`font-mono text-[15px] leading-none text-accent2 ${open ? "" : "menu-cursor"}`}
        >
          {open ? "\u25BE" : "\u25B8"}
        </span>
        <span className="flex-1">
          <span className="label-pixel block text-[13px] text-fg">
            {open ? "The launch form" : "Open the launch form"}
          </span>
          <span className="mt-1 block font-mono text-[11px] text-muted">
            token, pool, advanced — and the launch button
          </span>
        </span>
        {!open && (
          <span aria-hidden className="caret label-pixel text-[12px] text-accent3">
            press
          </span>
        )}
        <ChevronDown
          className={`h-5 w-5 shrink-0 text-accent3 transition-transform ${
            open ? "rotate-180" : "sprite-idle"
          }`}
        />
      </button>

      {open && (
        <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(300px,380px)]">
          <div id="launch-form" className="flex flex-col gap-4">
            {/* 1. Token. The project link that used to sit above this is gone: it only ever pre-filled
                these two fields from the last segment of a URL, and Website and X below collect the
                links themselves. Two ways to say where a project lives is one too many. */}
            <div className="panel p-6">
              <p className="label-pixel text-[13px] text-fg">Token</p>
              <p className="mt-1 font-mono text-[11px] text-muted">
                What goes on chain. All of it editable until you sign
              </p>

              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <label className="flex flex-col gap-2">
                  <span className={labelClass}>Name</span>
                  <span className={fieldFrame}>
                    <input
                      className={field}
                      value={name}
                      maxLength={24}
                      placeholder="Pontifex"
                      onChange={(e) => setName(e.target.value)}
                    />
                  </span>
                  {!nameOk && required}
                </label>
                <label className="flex flex-col gap-2">
                  <span className={labelClass}>Symbol</span>
                  <span className={fieldFrame}>
                    <input
                      className={field}
                      value={cleanSymbol}
                      maxLength={8}
                      placeholder="PONTIFEX"
                      onChange={(e) => setSymbol(e.target.value)}
                    />
                  </span>
                  {!symbolOk && required}
                </label>
              </div>

              <div className="mt-5">
                <span className={labelClass}>Token image</span>
                <div className="mt-2 flex flex-col gap-4 sm:flex-row sm:items-stretch">
                  {mark ? (
                    <img src={mark} alt="" className="pixel-img pixel-frame h-24 w-24 shrink-0 object-cover" />
                  ) : (
                    <span className="pixel-frame grid h-24 w-24 shrink-0 place-items-center bg-fg/10 font-mono text-sm text-muted">
                      {cleanSymbol.slice(0, 2) || "??"}
                    </span>
                  )}
                  <div
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      void pickImage(e.dataTransfer.files?.[0]);
                    }}
                    onClick={() => fileRef.current?.click()}
                    onKeyDown={(e) => e.key === "Enter" && fileRef.current?.click()}
                    role="button"
                    tabIndex={0}
                    className="pixel-frame flex flex-1 cursor-pointer flex-col justify-center bg-bg/40 px-4 py-5 text-left transition hover:bg-accent3/[0.10]"
                  >
                    <span className="label-pixel text-[12px] text-fg">
                      {uploading ? "Uploading…" : "Drop an image, or click to choose"}
                    </span>
                    <span className="mt-1.5 font-mono text-[11px] text-muted">
                      {canUpload === false
                        ? "PNG, JPEG, GIF or WebP · preview only on this host"
                        : "PNG, JPEG, GIF or WebP · 4 MB max · hosted here"}
                    </span>
                  </div>
                  <input
                    ref={fileRef}
                    type="file"
                    accept={IMAGE_TYPES.join(",")}
                    className="hidden"
                    onChange={(e) => void pickImage(e.target.files?.[0])}
                  />
                </div>
                {imageError && (
                  <span className="label-pixel mt-2 block text-[11px] text-accent2">{imageError}</span>
                )}
                {mark && (
                  <button
                    type="button"
                    onClick={() => {
                      setMark(null);
                      if (fileRef.current) fileRef.current.value = "";
                    }}
                    className="label-pixel mt-2 text-[11px] text-accent3 underline hover:text-accent"
                  >
                    remove the image
                  </button>
                )}

                <label className="mt-4 flex flex-col gap-2">
                  <span className={labelClass}>Image URL</span>
                  <span className={fieldFrame}>
                    <input
                      className={field}
                      value={imageUrl}
                      placeholder="https://…"
                      onChange={(e) => setImageUrl(e.target.value)}
                    />
                  </span>
                </label>
                <p className="mt-2 text-sm leading-relaxed text-muted">
                  {canUpload
                    ? "Dropping a file above uploads it here and fills this in. What goes on chain is this URL, not the file, and it cannot be changed after launch — so an image that stops loading stops loading forever."
                    : "What goes on chain is a URL, not a file, and this host cannot store one — so without an https link here the token launches with no image at all. The picture above is a preview in this browser."}
                </p>
              </div>

              <label className="mt-5 flex flex-col gap-2">
                <span className={labelClass}>Description</span>
                <span className={fieldFrame}>
                  <textarea
                    className={`${field} min-h-24 resize-y`}
                    value={description}
                    maxLength={MAX_DESCRIPTION}
                    placeholder="What this token is for."
                    onChange={(e) => setDescription(e.target.value)}
                  />
                </span>
                <span className="text-right font-mono text-[11px] text-muted">
                  {description.length}/{MAX_DESCRIPTION}
                </span>
              </label>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="flex flex-col gap-2">
                  <span className={labelClass}>Website</span>
                  <span className={fieldFrame}>
                    <input
                      className={field}
                      value={website}
                      placeholder="https://"
                      onChange={(e) => setWebsite(e.target.value)}
                    />
                  </span>
                </label>
                <label className="flex flex-col gap-2">
                  <span className={labelClass}>X / Twitter</span>
                  <span className={fieldFrame}>
                    <input
                      className={field}
                      value={x}
                      placeholder="@handle"
                      onChange={(e) => setX(e.target.value)}
                    />
                  </span>
                </label>
              </div>
            </div>

            {/* 2. Pool. This was a Terms section with a vault-share slider, a three-way split bar and a
                payout address. All three are gone: the fee destination is not a choice, so a control
                that implied it was one was describing a launchpad this is not. */}
            <div className="panel p-6">
              <p className="label-pixel text-[13px] text-fg">Pool</p>
              <p className="mt-1 font-mono text-[11px] text-muted">
                Written into the contract at launch. No setter exists afterwards.
              </p>

              <div className="pixel-frame mt-5 bg-accent/[0.10] px-4 py-3.5">
                <p className="label-pixel text-[12px] leading-[1.6] text-accent">
                  The whole creator-side fee goes to the PonsFund treasury.
                </p>
                <p className="mt-2 text-sm leading-relaxed text-muted">
                  <span className="font-mono text-fg">100%</span> of it, on every swap, for as long as the
                  token trades. There is no launcher share and no platform share to set, which is why
                  there is nothing to set here.
                </p>
              </div>

              <label className="mt-5 flex flex-col gap-2">
                <span className={labelClass}>Paired asset</span>
                <span className={fieldFrame}>
                  <select
                    className={`${field} appearance-none`}
                    value={pairedToken}
                    onChange={(e) => setPairedToken(e.target.value)}
                  >
                    {assets.map((a) => (
                      <option key={a.symbol} value={a.address ?? ""} disabled={!a.address}>
                        {a.address ? (a.label ?? a.symbol) : `${a.symbol} — not on ${explorer.label} yet`}
                      </option>
                    ))}
                  </select>
                </span>
              </label>
            </div>

            {/* 3. Advanced */}
            <div className="panel p-6">
              <button
                type="button"
                onClick={() => setAdvanced((v) => !v)}
                aria-expanded={advanced}
                className="flex w-full items-center gap-3 text-left"
              >
                <span className="label-pixel flex-1 text-[13px] text-fg">Advanced options</span>
                <ChevronDown
                  className={`h-4 w-4 shrink-0 text-accent3 transition-transform ${advanced ? "rotate-180" : ""}`}
                />
              </button>

              {advanced && (
                <div className="mt-5 flex flex-col gap-5">
                  <label className="flex flex-col gap-2">
                    <span className={labelClass}>Developer buy (ETH)</span>
                    <span className={`${fieldFrame} sm:max-w-48`}>
                      <input
                        className={field}
                        value={devBuyEth}
                        inputMode="decimal"
                        placeholder="0.0"
                        onChange={(e) => setDevBuyEth(e.target.value.replace(/[^0-9.]/g, ""))}
                      />
                    </span>
                    <span className="text-sm leading-relaxed text-muted">
                      Bought for you in the same transaction, at the launch price.
                    </span>
                  </label>

                  <div>
                    <span className={labelClass}>Snipe protection</span>
                    {/* Deliberately no numbers. The snipe tax is Pons's, it decays over the first
                        seconds of a launch, and this site does not set it -- quoting a percentage
                        here would be describing someone else's parameter as though it were ours,
                        and it would go stale the day they change it. */}
                    <p className="mt-2 text-sm leading-relaxed text-muted">
                      Pons charges a steep tax on buys in the first seconds of a launch, decaying to
                      its normal fee shortly after. It applies to everyone, including you: a launch
                      made here declares no exemptions, so there is no address that gets waved
                      through. The whole tax is a creator-side fee, so it goes to the treasury like
                      any other.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* 4. What you are signing. Sticky, because the form beside it is long. The split bar that used
              to sit at the bottom is gone with the slider that drove it: a bar drawn as one solid block
              is a chart of nothing. */}
          <div className="flex flex-col gap-4 self-start lg:sticky lg:top-24">
            <div className="panel p-5">
              <p className="label-pixel text-[13px] text-fg">What you are signing</p>
              <dl className="mt-4 flex flex-col gap-2.5 text-sm">
                {[
                  [
                    "Launch fee",
                    /* Read off Pons, not out of the config: it is their number and it can change,
                       and `msg.value` has to match it exactly or the launch reverts. Shows a dash
                       until the answer arrives rather than a zero that would read as "free". */
                    fee === null ? "—" : fee === 0n ? "None, gas only" : `${formatEth(fee)} ETH`,
                  ],
                  [
                    "Trading fee",
                    `${bpsToPercent(platform.tradingFeeBps?.swap ?? 100)}% per swap, both legs`,
                  ],
                  ["Paired asset", pairedLabel],
                ].map(([k, v]) => (
                  <div key={k} className="flex items-baseline justify-between gap-4">
                    <dt className={labelClass}>{k}</dt>
                    <dd className="text-right font-mono text-[12px] text-fg">{v}</dd>
                  </div>
                ))}
                <div className="flex items-baseline justify-between gap-4">
                  <dt className={labelClass}>To the treasury</dt>
                  <dd>
                    <span className="pixel-frame bg-accent/20 px-2 py-1 font-mono text-[12px] text-accent">
                      {bpsToPercent(VAULT_BPS)}% of every fee
                    </span>
                  </dd>
                </div>
              </dl>
              <p className="mt-4 text-sm leading-relaxed text-muted">
                The protocol keeps a cut of the pool fees before this one. That number is not published
                anywhere this page can read, so it is left out rather than guessed at.
              </p>
            </div>

            {/* The wallet band. Nothing above it touches a wallet; everything below it does. */}
            <div className="panel p-5">
              {!configured ? (
                <p className="label-pixel text-[12px] leading-[1.6] text-accent2">
                  {/* Names the one that is actually missing. "The treasury is not published" while the
                      treasury is set and the launchpad is not sends a reader to check the wrong key. */}
                  {isRealAddress(config.vault?.address)
                    ? "The PonsFund launchpad is not deployed yet, so this form cannot launch anything."
                    : "The treasury address is not published yet, so this form cannot launch anything."}{" "}
                  Save a draft in the meantime.
                </p>
              ) : wallet.status === "no-wallet" ? (
                <p className="label-pixel text-[12px] leading-[1.6] text-accent2">
                  No wallet in this browser. MetaMask, or any extension that injects one, is what this needs.
                </p>
              ) : wallet.status !== "connected" ? (
                <>
                  <p className="label-pixel text-[12px] text-accent2">Connect a wallet to launch.</p>
                  <button
                    type="button"
                    onClick={() => void wallet.connect()}
                    className="btn-pixel mt-4 inline-flex items-center gap-2.5 bg-accent px-5 py-3 text-[12px] leading-none text-bg"
                  >
                    <Wallet className="h-4 w-4" />
                    {wallet.status === "connecting" ? "Connecting…" : "Connect"}
                  </button>
                </>
              ) : !wallet.onLaunchChain ? (
                <>
                  <p className="label-pixel text-[12px] leading-[1.6] text-accent2">
                    Your wallet is on another chain. This launch goes to {explorer.label}.
                  </p>
                  <button
                    type="button"
                    onClick={() => void wallet.switchToLaunchChain()}
                    className="btn-pixel mt-4 inline-flex items-center gap-2.5 bg-accent px-5 py-3 text-[12px] leading-none text-bg"
                  >
                    Switch to {explorer.label}
                  </button>
                </>
              ) : (
                <>
                  <p className="font-mono text-[11px] text-muted">
                    {wallet.address?.slice(0, 6)}…{wallet.address?.slice(-4)} on {explorer.label}
                  </p>
                  <button
                    type="button"
                    onClick={() => void launch()}
                    disabled={!formOk || busy || !pons}
                    className={`btn-pixel mt-4 inline-flex w-full items-center justify-center gap-2.5 px-5 py-3.5 text-[12px] leading-none ${
                      formOk && !busy && pons ? "bg-accent text-bg" : "pointer-events-none bg-fg/10 text-muted opacity-60"
                    }`}
                  >
                    {busy ? "Working…" : !pons ? "Preparing…" : `Launch $${cleanSymbol || "TOKEN"}`}
                  </button>
                  {!formOk && (
                    <span className="label-pixel mt-3 block text-[11px] text-accent2">
                      A name and a ticker first.
                    </span>
                  )}
                </>
              )}
              {wallet.error && (
                <span className="label-pixel mt-3 block text-[11px] text-accent2">{wallet.error}</span>
              )}
            </div>

            {/* The banner preview tile that used to head this panel is gone. It drew the strip's own tile
                so a launcher could see what would come round up there -- but it previewed a draft only
                this browser can see, which made it a mirror of the form two panels up. */}
            <div className="panel p-5">
              <p className={labelClass}>Save it for later</p>
              <p className="mt-2 text-sm leading-relaxed text-muted">
                Keeps this form in your browser, and nowhere else. Nothing is signed and nothing is sent.
              </p>
              <button
                type="button"
                onClick={saveDraft}
                disabled={!formOk || drafts.length >= MAX_DRAFTS}
                className={`btn-pixel mt-4 inline-flex items-center gap-2.5 px-5 py-3 text-[12px] leading-none ${
                  formOk && drafts.length < MAX_DRAFTS
                    ? "bg-accent3/[0.18] text-accent3"
                    : "pointer-events-none bg-fg/10 text-muted opacity-60"
                }`}
              >
                Save as draft
              </button>
              {drafts.length >= MAX_DRAFTS && (
                <span className="label-pixel mt-3 block text-[11px] text-accent2">
                  <span className="font-mono">{MAX_DRAFTS}</span> drafts is the limit. Remove one first.
                </span>
              )}
            </div>

            {drafts.length > 0 && (
              <div className="panel p-5">
                <p className={labelClass}>Your drafts</p>
                <ul className="mt-4 flex flex-col gap-2">
                  {drafts.map((d) => (
                    <li key={d.id} className="flex items-center gap-3">
                      <span className="label-pixel flex-1 truncate text-[12px] text-fg">
                        {d.name} <span className="font-mono text-[11px] text-muted">${d.symbol}</span>
                      </span>
                      <button
                        type="button"
                        aria-label={`Remove ${d.name}`}
                        onClick={() => removeDraft(d.id)}
                        className="pixel-frame grid h-8 w-8 place-items-center text-accent3 transition hover:bg-accent3/15"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}

      {(message || deployed) && (
        <div className="dialogue mt-6 flex flex-col gap-3 px-4 py-3.5">
          <div className="flex items-center gap-3">
            <span className="label-pixel flex-1 text-[13px] leading-[1.5] text-fg">{message}</span>
            <span aria-hidden className="caret shrink-0 text-accent2">
              &#9662;
            </span>
          </div>
          {deployed && (
            <div className="flex flex-wrap items-center gap-3">
              <span className="glass px-3 py-2 font-mono text-[11px] text-fg">{deployed.address}</span>
              <a
                href={`${explorer.explorer}/token/${deployed.address}`}
                target="_blank"
                rel="noreferrer"
                className="btn-pixel inline-flex items-center gap-2.5 bg-accent3/[0.18] px-4 py-2.5 text-[12px] leading-none text-accent3"
              >
                <ExternalLink className="h-4 w-4" />
                Open on {explorer.explorerName}
              </a>
            </div>
          )}
        </div>
      )}
    </Section>
  );
}
