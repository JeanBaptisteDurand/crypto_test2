import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useLoader, useThree } from "@react-three/fiber";
import { useGLTF, useAnimations, Billboard, Center, Float } from "@react-three/drei";
import * as THREE from "three";
import { config, RESPECT_REDUCED_MOTION } from "../../lib/config";

/**
 * The 3D token mascot on the right of the hero.
 *   - assets.mascot3d set (a .glb the user dropped in assets/user/)  → that model, centred and scaled to fit
 *   - otherwise                                                        → a procedural matte coin faced with token.png
 * Rules: matte materials, three lights, no bloom, no environment map download (works offline and in screenshots),
 * slow rotation + float, mouse parallax, paused when offscreen, static under prefers-reduced-motion.
 * Loaded lazily by Hero.tsx so the text paints before three.js arrives (~150 KB gzip).
 */

function hex(c: string) {
  return new THREE.Color(c);
}

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (!RESPECT_REDUCED_MOTION) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const on = () => setReduced(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return reduced;
}

/** Shared motion: slow Y rotation, mouse parallax, gentle float. */
function Spin({ children, speed = 0.25, reduced }: { children: React.ReactNode; speed?: number; reduced: boolean }) {
  const group = useRef<THREE.Group>(null);
  const target = useRef({ x: 0, y: 0 });
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      target.current.x = (e.clientX / window.innerWidth - 0.5) * 0.6;
      target.current.y = (e.clientY / window.innerHeight - 0.5) * 0.4;
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, []);
  useFrame((state, dt) => {
    const g = group.current;
    if (!g) return;
    if (!reduced) g.rotation.y += dt * speed;
    g.rotation.x += (target.current.y * 0.6 - g.rotation.x) * 0.05;
    g.position.x += (target.current.x * 0.4 - g.position.x) * 0.05;
    void state;
  });
  return <group ref={group}>{children}</group>;
}

/** Plating. Two tones each, so the rim reads deeper than the struck face. */
const METALS = {
  gold: { face: "#e0b775", rim: "#ac8244" },
  silver: { face: "#d7dadd", rim: "#9aa1a8" },
} as const;
type Metal = keyof typeof METALS;

/** Keystone is cropped to its own alpha box, so this is the share of the face its artwork spans.
 *  The disc samples the texture's inscribed circle; 0.80 is the measured ceiling before the mascot's
 *  outermost pixels cross it. */
const FACE_SCALE = 0.78;
/** Flutes milled around the edge, the way a real coin is reeded. */
const FLUTES = 84;

/**
 * Coin geometry, built once per detail level and shared by every coin. The orbiting coins are ~34 px on
 * screen; at the original density four of them came to 47k triangles, 87% of it in the two rings, which is
 * most of what the scene was spending its frame on.
 */
const coinGeoCache = new Map<string, { rim: THREE.BufferGeometry; face: THREE.BufferGeometry; ring: THREE.BufferGeometry }>();
function coinGeometry(detail: "high" | "low") {
  const hit = coinGeoCache.get(detail);
  if (hit) return hit;
  const q =
    detail === "high"
      ? { seg: 6, circle: 96, ring: [96, 10] as const }
      : { seg: 3, circle: 32, ring: [40, 6] as const };
  const rim = new THREE.CylinderGeometry(1.58, 1.58, 0.26, FLUTES * q.seg, 1, true);
  const pos = rim.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const a = Math.atan2(z, x);
    const k = Math.hypot(x, z) + 0.03 * (Math.cos(a * FLUTES) * 0.5 + 0.5);
    pos.setX(i, Math.cos(a) * k);
    pos.setZ(i, Math.sin(a) * k);
  }
  pos.needsUpdate = true;
  rim.computeVertexNormals();
  const geo = {
    rim,
    face: new THREE.CircleGeometry(1.46, q.circle),
    ring: new THREE.TorusGeometry(1.47, 0.032, q.ring[1], q.ring[0]),
  };
  coinGeoCache.set(detail, geo);
  return geo;
}

/** Seeded PRNG: the wear pattern must be identical on every load, or screenshots never match. */
function mulberry32(a: number) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Canvas2D filter support, probed once. Chrome, Firefox and Safari 15+ have it; the loop is the fallback. */
const CANVAS_FILTER = (() => {
  try {
    const c = document.createElement("canvas").getContext("2d");
    return !!c && typeof c.filter === "string";
  } catch {
    return false;
  }
})();

function blank(size: number) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  return c;
}

/** Cheap fbm: octaves of seeded white noise, upscaled so the browser's bilinear filter smooths them. */
function fbmCanvas(size: number, seed: number) {
  const out = blank(size);
  const ctx = out.getContext("2d")!;
  ctx.fillStyle = "#808080";
  ctx.fillRect(0, 0, size, size);
  const rnd = mulberry32(seed);
  let amp = 0.55;
  for (const n of [6, 12, 24, 48, 96, 192]) {
    const c = blank(n);
    const cx = c.getContext("2d")!;
    const d = cx.createImageData(n, n);
    for (let i = 0; i < n * n; i++) {
      const v = (rnd() * 255) | 0;
      d.data[i * 4] = d.data[i * 4 + 1] = d.data[i * 4 + 2] = v;
      d.data[i * 4 + 3] = 255;
    }
    cx.putImageData(d, 0, 0);
    ctx.globalAlpha = amp;
    ctx.globalCompositeOperation = "overlay";
    ctx.drawImage(c, 0, 0, size, size);
    amp *= 0.62;
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
  return out;
}

/** Hairline scratches, white on black, for a handled-coin surface. */
function scratchCanvas(size: number, seed: number, count: number) {
  const c = blank(size);
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, size, size);
  const rnd = mulberry32(seed);
  for (let i = 0; i < count; i++) {
    const a = rnd() * Math.PI * 2;
    const len = size * (0.04 + rnd() * 0.34);
    const x = rnd() * size;
    const y = rnd() * size;
    ctx.strokeStyle = `rgba(255,255,255,${0.12 + rnd() * 0.5})`;
    ctx.lineWidth = 0.4 + rnd() * 1.7;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
    ctx.stroke();
  }
  return c;
}

/** Nicks and dents bitten out of the rim, densest near the edge where a coin actually wears. */
function dingCanvas(size: number, seed: number, count: number) {
  const c = blank(size);
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#808080";
  ctx.fillRect(0, 0, size, size);
  const rnd = mulberry32(seed);
  for (let i = 0; i < count; i++) {
    const a = rnd() * Math.PI * 2;
    const rr = (0.62 + rnd() * 0.36) * (size / 2);
    const x = size / 2 + Math.cos(a) * rr;
    const y = size / 2 + Math.sin(a) * rr;
    const r = size * (0.004 + rnd() * 0.02);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const dark = rnd() > 0.4;
    g.addColorStop(0, dark ? "rgba(0,0,0,0.75)" : "rgba(255,255,255,0.6)");
    g.addColorStop(1, "rgba(128,128,128,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  return c;
}

/** A soft radial gradient in a canvas, for additive glows. */
function radialTexture(stops: [number, string][]) {
  const size = 256;
  const c = blank(size);
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [at, colour] of stops) g.addColorStop(at, colour);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Pointer position over the window, -0.5..0.5 on each axis. */
function usePointer() {
  const p = useRef({ x: 0, y: 0 });
  useEffect(() => {
    const on = (e: PointerEvent) => {
      p.current.x = e.clientX / window.innerWidth - 0.5;
      p.current.y = e.clientY / window.innerHeight - 0.5;
    };
    window.addEventListener("pointermove", on, { passive: true });
    return () => window.removeEventListener("pointermove", on);
  }, []);
  return p;
}

/**
 * Wear layers are the same for every coin -- they depend on the die, not on the logo -- so they are
 * generated once per size and shared. Four coins each rebuilding their own noise, scratches and dents was
 * most of the scene's start-up cost. Read-only: callers draw them onto their own canvases.
 */
const wearCache = new Map<number, { fbm: HTMLCanvasElement; scratches: HTMLCanvasElement; dings: HTMLCanvasElement }>();
function sharedWear(size: number) {
  let w = wearCache.get(size);
  if (!w) {
    w = {
      fbm: fbmCanvas(size, 1337),
      scratches: scratchCanvas(size, 4242, Math.round(220 * (size / 1024))),
      dings: dingCanvas(size, 909, Math.round(90 * (size / 1024))),
    };
    wearCache.set(size, w);
  }
  return w;
}

/** The mascot's own alpha bounding box, so it can be scaled to the die rather than to its padding. */
function contentBox(img: HTMLImageElement) {
  const n = 96;
  const c = blank(n);
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, n, n);
  const d = ctx.getImageData(0, 0, n, n).data;
  let x0 = n,
    y0 = n,
    x1 = -1,
    y1 = -1;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (d[(y * n + x) * 4 + 3] > 12) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  const k = img.width / n;
  if (x1 < 0) return { sx: 0, sy: 0, sw: img.width, sh: img.height };
  return { sx: x0 * k, sy: y0 * k, sw: (x1 - x0 + 1) * k, sh: (y1 - y0 + 1) * k };
}

/**
 * A warm studio environment, as a small cube map applied straight to the materials.
 *
 * It used to go through PMREMGenerator on scene.environment. Measured, that cost ~530 ms of main-thread
 * stall while the scene mounted and 20 fps in steady state (41 vs 61 with it off) -- the whole page froze
 * for over a second. A plain cube map skips the prefilter pass entirely. The trade is that reflections no
 * longer blur with roughness, which does not show here: this environment is a soft gradient with three
 * light blobs, so there is almost nothing to blur.
 */
const ENV_FACE = 64;
let envCube: THREE.CubeTexture | null = null;
function goldEnvMap() {
  if (envCube) return envCube;
  const face = (paint: (ctx: CanvasRenderingContext2D) => void) => {
    const c = blank(ENV_FACE);
    paint(c.getContext("2d")!);
    return c;
  };
  const side = (ctx: CanvasRenderingContext2D) => {
    const g = ctx.createLinearGradient(0, 0, 0, ENV_FACE);
    g.addColorStop(0, "#fff6e0");
    g.addColorStop(0.45, "#a3855f");
    g.addColorStop(0.7, "#4a3826");
    g.addColorStop(1, "#6b5236");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, ENV_FACE, ENV_FACE);
  };
  const flat = (colour: string) => (ctx: CanvasRenderingContext2D) => {
    ctx.fillStyle = colour;
    ctx.fillRect(0, 0, ENV_FACE, ENV_FACE);
  };
  // px, nx, py, ny, pz, nz
  envCube = new THREE.CubeTexture([
    face(side),
    face(side),
    face(flat("#fff4d8")),
    face(flat("#6b5236")),
    face(side),
    face(side),
  ]);
  envCube.colorSpace = THREE.SRGBColorSpace;
  envCube.needsUpdate = true;
  return envCube;
}

/**
 * Procedural coin, struck rather than printed: the mascot drives a bump map so it reads as relief in the
 * same gold as the rim. Faces are separate discs, not the cylinder's caps, whose UVs sample the texture in
 * an orientation we cannot steer. The rim is reeded by displacing a high-segment cylinder, and colour,
 * roughness and bump all carry procedural wear so the gold reads as handled rather than rendered.
 */
function useCoinParts(image: string, metal: Metal, mapSize: number) {
  const img = useLoader(THREE.ImageLoader, image);
  const env = goldEnvMap();

  const maps = useMemo(() => {
    const size = mapSize;
    const box = contentBox(img);
    const w = (size * FACE_SCALE * box.sw) / Math.max(box.sw, box.sh);
    const h = (size * FACE_SCALE * box.sh) / Math.max(box.sw, box.sh);
    const dx = (size - w) / 2;
    const dy = (size - h) / 2;
    const drawMascot = (ctx: CanvasRenderingContext2D) =>
      ctx.drawImage(img, box.sx, box.sy, box.sw, box.sh, dx, dy, w, h);

    const { fbm, scratches, dings } = sharedWear(size);

    // Relief: the mascot embosses, fine noise and dents roughen the field around it.
    const bumpC = blank(size);
    const b = bumpC.getContext("2d")!;
    b.fillStyle = "#6e6e6e";
    b.fillRect(0, 0, size, size);
    // Greyscale via the 2D filter rather than a JS loop over every pixel: with four coins that loop was a
    // large part of the ~1.3s stall the whole page suffered while the scene mounted.
    if (CANVAS_FILTER) b.filter = "grayscale(1)";
    drawMascot(b);
    if (CANVAS_FILTER) {
      b.filter = "none";
    } else {
      const bd = b.getImageData(0, 0, size, size);
      for (let i = 0; i < bd.data.length; i += 4) {
        const v = 0.299 * bd.data[i] + 0.587 * bd.data[i + 1] + 0.114 * bd.data[i + 2];
        bd.data[i] = bd.data[i + 1] = bd.data[i + 2] = v;
      }
      b.putImageData(bd, 0, 0);
    }
    b.globalAlpha = 0.35;
    b.globalCompositeOperation = "overlay";
    b.drawImage(fbm, 0, 0);
    b.globalAlpha = 0.8;
    b.drawImage(dings, 0, 0);
    b.globalAlpha = 1;
    b.globalCompositeOperation = "source-over";

    // Colour: gold, darkened unevenly, patina settling into the struck recesses, bright scratches on top.
    const colC = blank(size);
    const c = colC.getContext("2d")!;
    c.fillStyle = METALS[metal].face;
    c.fillRect(0, 0, size, size);
    c.globalCompositeOperation = "multiply";
    c.globalAlpha = 0.28;
    c.drawImage(fbm, 0, 0);
    c.globalAlpha = 0.18;
    c.drawImage(bumpC, 0, 0);
    c.globalCompositeOperation = "screen";
    c.globalAlpha = 0.5;
    c.drawImage(scratches, 0, 0);
    // Worn outer band: the edge of a coin loses its gilding first.
    c.globalCompositeOperation = "multiply";
    c.globalAlpha = 1;
    const vig = c.createRadialGradient(size / 2, size / 2, size * 0.3, size / 2, size / 2, size * 0.5);
    vig.addColorStop(0, "#ffffff");
    vig.addColorStop(1, metal === "silver" ? "#9fa5ab" : "#c3a271");
    c.fillStyle = vig;
    c.fillRect(0, 0, size, size);
    c.globalCompositeOperation = "source-over";

    // Roughness: mid base, noise everywhere, scratches polished, recesses duller.
    const rghC = blank(size);
    const r = rghC.getContext("2d")!;
    r.fillStyle = "#666666";
    r.fillRect(0, 0, size, size);
    r.globalCompositeOperation = "overlay";
    r.globalAlpha = 0.75;
    r.drawImage(fbm, 0, 0);
    r.globalCompositeOperation = "multiply";
    r.globalAlpha = 0.55;
    r.drawImage(scratches, 0, 0);
    r.globalAlpha = 1;
    r.globalCompositeOperation = "source-over";

    const tex = (canvas: HTMLCanvasElement, srgb: boolean) => {
      const t = new THREE.CanvasTexture(canvas);
      t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      t.anisotropy = 8;
      return t;
    };
    return { map: tex(colC, true), bumpMap: tex(bumpC, false), roughnessMap: tex(rghC, false) };
  }, [img, mapSize, metal]);

  const faceMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#ffffff",
        map: maps.map,
        bumpMap: maps.bumpMap,
        bumpScale: 5.5,
        roughnessMap: maps.roughnessMap,
        metalness: 1,
        roughness: 1,
        envMap: env,
        envMapIntensity: 1.5,
      }),
    [maps, env],
  );
  const rimMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: hex(METALS[metal].rim),
        metalness: 1,
        roughness: 0.38,
        envMap: env,
        envMapIntensity: 1.1,
      }),
    [metal, env],
  );
  const edgeMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: hex(METALS[metal].face),
        metalness: 1,
        roughness: 0.26,
        envMap: env,
        envMapIntensity: 1.3,
      }),
    [metal, env],
  );

  useEffect(() => {
    return () => {
      maps.map.dispose();
      maps.bumpMap.dispose();
      maps.roughnessMap.dispose();
    };
  }, [maps]);

  return { faceMat, rimMat, edgeMat };
}

/** The struck coin itself, in its own frame: faces on +/-Y, so callers orient it. */
function CoinBody({
  image = config.token.image,
  metal = "gold",
  mapSize = 1024,
  detail = "high",
  fade,
}: {
  image?: string;
  metal?: Metal;
  mapSize?: number;
  detail?: "high" | "low";
  /** 0..1, read every frame. Applied straight to this coin's three materials -- walking the subtree each
   *  frame to find them, and writing transparent/depthWrite while doing it, forced shader recompiles. */
  fade?: React.MutableRefObject<number>;
}) {
  const { faceMat, rimMat, edgeMat } = useCoinParts(image, metal, mapSize);
  const geo = coinGeometry(detail);

  useFrame(() => {
    if (!fade) return;
    const o = fade.current;
    faceMat.opacity = o;
    rimMat.opacity = o;
    edgeMat.opacity = o;
  });

  useEffect(() => {
    if (!fade) return;
    for (const m of [faceMat, rimMat, edgeMat]) m.transparent = true;
  }, [fade, faceMat, rimMat, edgeMat]);

  return (
    <group rotation={[Math.PI / 2, 0, 0]}>
      <mesh geometry={geo.rim} material={rimMat} />
      <mesh position={[0, 0.13, 0]} rotation={[-Math.PI / 2, 0, 0]} geometry={geo.face} material={faceMat} />
      <mesh position={[0, -0.13, 0]} rotation={[Math.PI / 2, 0, 0]} geometry={geo.face} material={faceMat} />
      <mesh position={[0, 0.134, 0]} rotation={[Math.PI / 2, 0, 0]} geometry={geo.ring} material={edgeMat} />
      <mesh position={[0, -0.134, 0]} rotation={[Math.PI / 2, 0, 0]} geometry={geo.ring} material={edgeMat} />
    </group>
  );
}

/** No chest model provided: the coin alone, floating. This is the current hero. */
function Coin({ reduced }: { reduced: boolean }) {
  return (
    <Float speed={reduced ? 0 : 1.2} rotationIntensity={reduced ? 0 : 0.25} floatIntensity={reduced ? 0 : 0.6}>
      <Spin reduced={reduced}>
        <CoinBody />
      </Spin>
    </Float>
  );
}

/** Names a lid node is likely to carry, when the model has no open/close animation to scrub. */
const LID_RE = /lid|top|cover|cap|couvercle|hatch/i;

/** Pulled back from the coin-only 6.5: the chest plus its orbit needs a wider field. */
const CHEST_CAMERA_Z = 75.0;
/** Chest scale. Sized with the orbit: a bigger chest needs a wider ring, which needs the camera further
 *  back, which shrinks everything again. 4.4 with a 50 deg ring is where the chest is largest on screen. */
const CHEST_FIT = 22.6;
/** Turned slightly to the left, and nothing else: no pitch, no roll. */
const CHEST_YAW = -0.26;
/** Smallest radius whose whole trajectory clears the chest's box by a margin, at this tilt. */
const ORBIT_COIN_SCALE = 0.95;
/**
 * One ring per coin. Radii are the solved part: two coins can only touch if their distances to the centre
 * come within 2 * coinRadius, so keeping the radii spaced further apart than that makes contact impossible
 * whatever the planes, phases or speeds do. Each radius is also the smallest that clears the chest's real
 * box on its own plane -- the enclosing sphere is far too pessimistic for a chest this flat and wide.
 * tiltZ/tiltY orient each plane; they are what make the rings read as different axes.
 */
/**
 * Low rings. They pass around and *behind* the chest rather than over it, which is what lets the chest be
 * large: an orbit that clears the raised lid has to reach 0.84 of the chest's width above it, and the frame
 * then has to hold nearly twice the chest. Going behind instead, the rings only have to clear the base.
 */
const RINGS = [
  { radius: 13.7, tiltZ: 0, tiltY: 90, speed: 0.34 },
  { radius: 17.1, tiltZ: 12, tiltY: 0, speed: 0.27 },
];
/**
 * Four coins over three rings. Two coins share the first ring, held exactly half a turn apart: same radius,
 * same speed, so their gap never changes and they cannot meet. That is what buys the chest its size -- a
 * fourth ring would have to sit a further 1.2 units out, and every unit of outer radius pushes the camera
 * back and shrinks everything on screen.
 */
const SLOTS = [
  { ring: 0, phase: 0 },
  { ring: 0, phase: Math.PI },
  { ring: 1, phase: 1.1 },
  { ring: 1, phase: 1.1 + Math.PI },
];
/** How far the coins dim as they travel behind the chest. */
const FADE_MIN = 0.1;
/** Trail: angular lag of each ghost behind its coin, with its scale and strength. */
const TRAIL = [
  { lag: 0.08, scale: 0.9, alpha: 0.62 },
  { lag: 0.15, scale: 0.68, alpha: 0.36 },
  { lag: 0.225, scale: 0.46, alpha: 0.18 },
];
/** Tilting the ring trades horizontal reach for vertical. The chest is wide and shallow, so a steeper ring
 *  passes over and under it rather than around its widest axis, and buys back room for a bigger chest.
 *  The framing budget also has to carry Float's drift and a safety margin, or the coin clips the edges. */

/**
 * Where the opening ends. Exported clips are routinely several takes concatenated -- this model's single
 * 5.4 s "HarrisChestClips" is open, close, jiggle, half-open, close -- so scrubbing to the clip's duration
 * would play the lot on one hover, and land on a shut lid. Sample the lid's quaternion track and stop at
 * its first peak, which is the end of the opening take.
 */
function findOpenEnd(action: THREE.AnimationAction) {
  const clip = action.getClip();
  let best: { t: number; amp: number } | null = null;
  // Rig controllers first: this file's mesh tracks are baked in world space, so their rotation carries the
  // clip's global tumble and peaks in the wrong place. The controller track is clean local motion.
  const lid = clip.tracks.filter((t) => /\.quaternion$/.test(t.name) && LID_RE.test(t.name));
  const ordered = [...lid.filter((t) => /ctrl/i.test(t.name)), ...lid.filter((t) => !/ctrl/i.test(t.name))];
  for (const track of ordered.slice(0, /ctrl/i.test(ordered[0]?.name ?? "") ? 1 : ordered.length)) {
    const { times, values } = track;
    let peakT = times[0];
    let peak = -1;
    for (let i = 0; i < times.length; i++) {
      const a = 2 * Math.acos(Math.min(1, Math.abs(values[i * 4 + 3])));
      if (a > peak) {
        peak = a;
        peakT = times[i];
      } else if (a < peak - 0.05) {
        break; // past the first peak: that take is over
      }
    }
    if (!best || peak > best.amp) best = { t: peakT, amp: peak };
  }
  return best && best.t > 0 ? best.t : clip.duration;
}

/**
 * The user's chest model, opening on hover. Three ways a chest can open, tried in order:
 *   1. the glTF ships an animation -> scrub it forward on enter, backward on leave (works both ways,
 *      unlike play(), and lands anywhere if the pointer leaves mid-open)
 *   2. a node named like a lid -> hinge it on its own back edge
 *   3. two variants in one file (an open one and a closed one) -> swap which is visible
 * Which one applies depends on the file, so this is verified against the real GLB once it lands.
 */
function Chest({ url, reduced, onOpenChange }: { url: string; reduced: boolean; onOpenChange?: (o: boolean) => void }) {
  const root = useRef<THREE.Group>(null);
  const { scene, animations } = useGLTF(url);
  const { mixer } = useAnimations(animations, root);
  // Same reason as the environment: an offscreen canvas runs on "demand", and the model resolves long
  // after the first paint. Without this the chest never gets drawn on a phone until something else
  // happens to invalidate.
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    const env = goldEnvMap();
    scene.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
      if (m && "envMap" in m) {
        m.envMap = env;
        m.needsUpdate = true;
      }
    });
    invalidate();
  }, [scene, invalidate]);
  const [open, setOpen] = useState(false);
  // Decided from the file, not from whether the action has resolved yet: otherwise the lid strategy would
  // fight the mixer for the first few frames and leave the rig in a broken pose.
  const hasClip = animations.length > 0;

  // The whole clip plays, because its tracks are baked in world space: the lid's motion only makes sense
  // alongside the base's. What is wrong for a hover is the tumble baked into every node -- the chest swings
  // away from the viewer. So instead of filtering nodes, `stab` below cancels the base's own movement, which
  // pins the chest in place and leaves exactly the relative motion: the lid opening.
  const [anim, setAnim] = useState<{ action: THREE.AnimationAction; openEnd: number } | null>(null);
  useEffect(() => {
    const clip = animations[0];
    const target = root.current;
    if (!clip || !mixer || !target) return;
    const a = mixer.clipAction(clip, target);
    a.play();
    a.paused = true;
    a.time = 0;
    // Apply the pose now, not on the next frame: <Fit> re-measures as soon as `anim` is set, and it must
    // see the closed chest rather than the rig's rest pose.
    mixer.update(0);
    setAnim({ action: a, openEnd: findOpenEnd(a) });
    return () => {
      a.stop();
      mixer.uncacheAction(clip, target);
      restInv.current = null;
    };
  }, [animations, mixer]);
  const action = anim?.action ?? null;

  // Strategy 2 and 3 both need to know what the file actually contains.
  const parts = useMemo(() => {
    let lid: THREE.Object3D | null = null;
    let openVariant: THREE.Object3D | null = null;
    let closedVariant: THREE.Object3D | null = null;
    scene.traverse((o) => {
      if (!lid && LID_RE.test(o.name)) lid = o;
      if (!openVariant && /(^|[_\-\s])open/i.test(o.name)) openVariant = o;
      if (!closedVariant && /(^|[_\-\s])close/i.test(o.name)) closedVariant = o;
    });
    return { lid, openVariant, closedVariant };
  }, [scene]);

  /** chest_base_g's transform relative to the model root, from local matrices only. */
  const baseNode = useMemo(() => {
    let found: THREE.Object3D | null = null;
    scene.traverse((o) => {
      if (!found && /base/i.test(o.name) && /_g$/.test(o.name)) found = o;
    });
    return found as THREE.Object3D | null;
  }, [scene]);
  const stab = useRef<THREE.Group>(null);
  const restInv = useRef<THREE.Matrix4 | null>(null);
  const scratch = useMemo(() => new THREE.Matrix4(), []);

  const baseMatrix = (out: THREE.Matrix4) => {
    out.identity();
    if (!baseNode) return out;
    const chain: THREE.Object3D[] = [];
    for (let n: THREE.Object3D | null = baseNode; n && n !== scene; n = n.parent) chain.push(n);
    for (let i = chain.length - 1; i >= 0; i--) out.multiply(chain[i].matrix);
    return out;
  };

  const lidRest = useRef<number | null>(null);
  useEffect(() => {
    if (parts.lid && lidRest.current === null) lidRest.current = (parts.lid as THREE.Object3D).rotation.x;
  }, [parts.lid]);

  useEffect(() => {
    onOpenChange?.(open);
    // Variant swap needs no easing: it is a cut, not a motion.
    if (!hasClip && !parts.lid && parts.openVariant && parts.closedVariant) {
      (parts.openVariant as THREE.Object3D).visible = open;
      (parts.closedVariant as THREE.Object3D).visible = !open;
    }
  }, [open, hasClip, parts, onOpenChange]);

  useFrame((_, dt) => {
    // Frame-rate independent damping, so the lid takes the same time on 60 and 144 Hz. Under reduced
    // motion the lid still opens -- it answers a hover, it is not idle movement -- just faster.
    const k = 1 - Math.exp((reduced ? -22 : -9) * dt);
    if (action) {
      const target = open ? (anim?.openEnd ?? 0) : 0;
      action.time += (target - action.time) * k;
      mixer.update(0);
      // Cancel the base's baked world motion, measured against its pose at t=0 so rest stays identity.
      if (stab.current && baseNode) {
        if (!restInv.current) restInv.current = baseMatrix(new THREE.Matrix4());
        baseMatrix(scratch).invert().premultiply(restInv.current);
        stab.current.matrixAutoUpdate = false;
        stab.current.matrix.copy(scratch);
        stab.current.matrixWorldNeedsUpdate = true;
      }
    } else if (!hasClip && parts.lid && lidRest.current !== null) {
      const l = parts.lid as THREE.Object3D;
      const target = lidRest.current - (open ? 1.15 : 0);
      l.rotation.x += (target - l.rotation.x) * k;
    }
  });

  return (
    <group
      ref={root}
      onPointerOver={(e) => {
        e.stopPropagation();
        setOpen(true);
      }}
      onPointerOut={() => setOpen(false)}
    >
      {/* cacheKey for the same reason as Fit's remeasure: centring the rig's rest pose puts the chest
          off-centre once the mixer poses it. */}
      <Center cacheKey={anim !== null}>
        <Fit target={CHEST_FIT} remeasure={anim !== null}>
          <group ref={stab}>
            <primitive object={scene} />
          </group>
        </Fit>
      </Center>
      {/* Generous hover volume: the pointer should not have to hit the geometry exactly. Invisible
          meshes are skipped by the raycaster, so this is a transparent one instead. */}
      <mesh>
        <sphereGeometry args={[2.7, 16, 16]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
    </group>
  );
}

/** One coin on one ring. The plane is fixed by two nested groups, the run is the innermost rotation. */
function OrbitingCoin({
  slot,
  image,
  metal,
  reduced,
  boost,
}: {
  slot: (typeof SLOTS)[number];
  image: string;
  metal: Metal;
  reduced: boolean;
  boost: boolean;
}) {
  const ring = RINGS[slot.ring];
  const run = useRef<THREE.Group>(null);
  const self = useRef<THREE.Group>(null);
  const speed = useRef(ring.speed);
  const here = useMemo(() => new THREE.Vector3(), []);
  const fade = useRef(1);
  useEffect(() => {
    if (run.current) run.current.rotation.y = slot.phase;
  }, [slot.phase]);
  useFrame((_, dt) => {
    speed.current += ((boost ? ring.speed * 1.7 : ring.speed) - speed.current) * (1 - Math.exp(-3 * dt));
    if (reduced) return;
    if (run.current) run.current.rotation.y += dt * speed.current;
    if (self.current) self.current.rotation.z += dt * 0.9;
    // Fade out while behind the chest. The rings are low and wide, so a coin spends much of its lap back
    // there; dimming it reads as depth instead of as a coin sliding out from under the chest.
    const g = self.current;
    if (g) {
      g.getWorldPosition(here);
      const t = THREE.MathUtils.clamp(here.z / ring.radius + 0.55, 0, 1);
      fade.current = FADE_MIN + (1 - FADE_MIN) * t;
      halo.opacity = 0.72 * fade.current;
      for (let i = 0; i < ghosts.length; i++) ghosts[i].opacity = TRAIL[i].alpha * fade.current;
    }
  });

  // Glow around the coin and the ghosts trailing it. One shared texture, one material per element so each
  // can carry its own strength; all of them ride the same depth fade as the coin.
  const glowTex = useMemo(
    () =>
      radialTexture([
        [0, "rgba(255,240,200,0.9)"],
        [0.35, "rgba(226,178,90,0.45)"],
        [0.7, "rgba(196,146,58,0.12)"],
        [1, "rgba(0,0,0,0)"],
      ]),
    [],
  );
  const halo = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        map: glowTex,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        opacity: 0.72,
      }),
    [glowTex],
  );
  const ghosts = useMemo(
    () =>
      TRAIL.map(
        (t) =>
          new THREE.MeshBasicMaterial({
            map: glowTex,
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
            opacity: t.alpha,
          }),
      ),
    [glowTex],
  );
  useEffect(
    () => () => {
      glowTex.dispose();
      halo.dispose();
      ghosts.forEach((m) => m.dispose());
    },
    [glowTex, halo, ghosts],
  );

  const coinR = 1.63 * ORBIT_COIN_SCALE;

  return (
    <group rotation={[0, (ring.tiltY * Math.PI) / 180, 0]}>
      <group rotation={[0, 0, (ring.tiltZ * Math.PI) / 180]}>
        <group ref={run}>
          {/* The ghosts sit at a fixed angular lag on the same ring, so they follow the coin for free. */}
          {TRAIL.map((t, i) => (
            <group
              key={t.lag}
              position={[ring.radius * Math.cos(t.lag), 0, ring.radius * Math.sin(t.lag)]}
            >
              <Billboard>
                <mesh material={ghosts[i]} scale={coinR * 3.1 * t.scale}>
                  <planeGeometry args={[1, 1]} />
                </mesh>
              </Billboard>
            </group>
          ))}
          <group position={[ring.radius, 0, 0]}>
            <Billboard>
              <mesh material={halo} scale={coinR * 3.4}>
                <planeGeometry args={[1, 1]} />
              </mesh>
            </Billboard>
            <group scale={ORBIT_COIN_SCALE}>
              {/* Kept facing the camera: a coin this small is only readable face-on, and each ring's plane
                  would otherwise show it edge-on for half of every lap. It still spins in its own plane. */}
              <Billboard>
                <group ref={self}>
                  <CoinBody image={image} metal={metal} mapSize={160} detail="low" fade={fade} />
                </group>
              </Billboard>
            </group>
          </group>
        </group>
      </group>
    </group>
  );
}

/**
 * The light inside the chest, rising as the lid opens. A point light so the lid and the treasure actually
 * catch it, plus an additive halo that the chest itself occludes -- so the glow reads as coming out of the
 * opening rather than sitting on top of the image. Not bloom: nothing post-processes the frame.
 */
function SacredGlow({ open }: { open: boolean }) {
  const light = useRef<THREE.PointLight>(null);
  const halo = useRef<THREE.Mesh>(null);
  const k = useRef(0);

  const tex = useMemo(
    () =>
      radialTexture([
        [0, "rgba(255,244,214,1)"],
        [0.32, "rgba(255,211,133,0.7)"],
        [0.6, "rgba(224,169,78,0.2)"],
        [1, "rgba(0,0,0,0)"],
      ]),
    [],
  );

  useFrame((_, dt) => {
    k.current += ((open ? 1 : 0) - k.current) * (1 - Math.exp(-5 * dt));
    if (light.current) light.current.intensity = k.current * 19;
    if (halo.current) {
      (halo.current.material as THREE.MeshBasicMaterial).opacity = k.current * 0.85;
      halo.current.scale.setScalar(0.8 + k.current * 0.5);
    }
  });

  useEffect(() => () => tex.dispose(), [tex]);

  return (
    <group position={[0, CHEST_FIT * 0.14, -CHEST_FIT * 0.05]}>
      <pointLight ref={light} color="#ffd79a" intensity={0} distance={14} decay={2} />
      <mesh ref={halo}>
        <planeGeometry args={[CHEST_FIT * 0.82, CHEST_FIT * 0.82]} />
        <meshBasicMaterial
          map={tex}
          transparent
          opacity={0}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
    </group>
  );
}

/**
 * A slow pulse behind the chest. Sits further back than the chest is deep, so the chest occludes its middle
 * and it reads as a halo around the silhouette rather than a disc pasted behind it.
 */
function BackGlow({ reduced }: { reduced: boolean }) {
  const mesh = useRef<THREE.Mesh>(null);
  const tex = useMemo(
    () =>
      radialTexture([
        [0, "rgba(224,169,78,0.85)"],
        [0.4, "rgba(190,132,58,0.35)"],
        [0.75, "rgba(120,80,34,0.1)"],
        [1, "rgba(0,0,0,0)"],
      ]),
    [],
  );
  useFrame((state) => {
    if (!mesh.current) return;
    const pulse = reduced ? 0.5 : 0.5 + 0.5 * Math.sin(state.clock.elapsedTime * 0.85);
    (mesh.current.material as THREE.MeshBasicMaterial).opacity = 0.1 + pulse * 0.34;
    mesh.current.scale.setScalar(0.97 + pulse * 0.16);
  });
  useEffect(() => () => tex.dispose(), [tex]);
  return (
    <mesh ref={mesh} position={[0, 0, -CHEST_FIT * 0.5]}>
      <planeGeometry args={[CHEST_FIT * 1.5, CHEST_FIT * 1.5]} />
      <meshBasicMaterial map={tex} transparent opacity={0.15} depthWrite={false} blending={THREE.AdditiveBlending} />
    </mesh>
  );
}

/** Levitation, as a share of the chest so it stays equally visible when the scene is rescaled. drei's
 *  <Float> works on a default range of +/-0.1 scaled by its intensity, which came to about 0.03 here --
 *  invisible. Done by hand so the amplitude is explicit and fits the framing budget. */
const LEVITATE = CHEST_FIT * 0.1;
const LEVITATE_SPEED = 0.8;

/**
 * The chest hovers on its own and leans towards the pointer: together they say it can be interacted with,
 * before anyone actually hovers it. Translation plus a touch of yaw -- no pitch, no roll, so it still reads
 * as sitting upright. Amplitudes stay inside the framing margin.
 */
function PointerDrift({ children, reduced }: { children: React.ReactNode; reduced: boolean }) {
  const g = useRef<THREE.Group>(null);
  const ptr = usePointer();
  // Pointer lag is damped; the bob is added on top, because damping an oscillation would flatten it.
  const drift = useRef({ x: 0, y: 0 });
  useFrame((state, dt) => {
    if (!g.current || reduced) return;
    const k = 1 - Math.exp(-2.6 * dt);
    drift.current.x += (ptr.current.x * CHEST_FIT * 0.045 - drift.current.x) * k;
    drift.current.y += (-ptr.current.y * CHEST_FIT * 0.03 - drift.current.y) * k;
    const bob = Math.sin(state.clock.elapsedTime * LEVITATE_SPEED) * LEVITATE;
    g.current.position.x = drift.current.x;
    g.current.position.y = drift.current.y + bob;
    g.current.rotation.y += (ptr.current.x * 0.12 - g.current.rotation.y) * k;
  });
  return <group ref={g}>{children}</group>;
}

/** Chest + orbiting coin: the composition used as soon as assets.mascot3d exists. */
function ChestScene({ url, reduced }: { url: string; reduced: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <PointerDrift reduced={reduced}>
        <BackGlow reduced={reduced} />
        <group rotation={[0, CHEST_YAW, 0]}>
          <Chest url={url} reduced={reduced} onOpenChange={setOpen} />
        </group>
        <SacredGlow open={open} />
      </PointerDrift>
      {(config.hero?.coins ?? []).map((c, i) => (
        <OrbitingCoin
          key={c.image}
          slot={SLOTS[i % SLOTS.length]}
          image={c.image}
          metal={c.metal === "silver" ? "silver" : "gold"}
          reduced={reduced}
          boost={open}
        />
      ))}
    </>
  );
}

/**
 * Scales its children so the bounding box's largest side equals `target`.
 * `remeasure` matters for rigged models: measured on the bind pose, this chest's box comes out 3.38 x 3.19
 * x 2.84 -- nearly cubic, because the rig's rest pose has the parts flown apart. The chest itself is
 * 1 x 0.54 x 0.85, so fitting the bind pose scaled the rig and left the chest about half the size asked
 * for. Flip `remeasure` once the mixer has applied t=0 and the box describes the actual chest.
 */
function Fit({ children, target, remeasure }: { children: React.ReactNode; target: number; remeasure?: unknown }) {
  const ref = useRef<THREE.Group>(null);
  const [scale, setScale] = useState(1);
  useEffect(() => {
    if (!ref.current) return;
    const box = new THREE.Box3().setFromObject(ref.current);
    const size = new THREE.Vector3();
    box.getSize(size);
    // setFromObject works in world space, so the scale this group already carries is baked into `size`.
    // Divide it back out, or the second measurement fits an already-fitted subtree and collapses to 1.
    const applied = ref.current.scale.x || 1;
    const max = Math.max(size.x, size.y, size.z) / applied || 1;
    setScale(target / max);
  }, [target, remeasure]);
  return (
    <group ref={ref} scale={scale}>
      {children}
    </group>
  );
}

/**
 * Signals when the scene is genuinely drawing. Mounted inside <Suspense>, so by the time it counts a frame
 * the model and textures have resolved; the extra frames cover shader compilation and the first texture
 * uploads, which are what freeze the main thread. The canvas stays hidden until then, so that freeze
 * happens off-screen instead of as a stutter on a half-drawn chest.
 */
function ReadySignal({ onReady }: { onReady: () => void }) {
  const seen = useRef(0);
  const done = useRef(false);
  useFrame(() => {
    if (done.current) return;
    seen.current += 1;
    if (seen.current >= 4) {
      done.current = true;
      onReady();
    }
  });
  return null;
}

function Lights() {
  return (
    <>
      <ambientLight intensity={0.18} />
      <directionalLight position={[-4, 5, 6]} intensity={1.1} color="#fff4dd" />
      <directionalLight position={[5, -2, -4]} intensity={0.3} color="#ffe6bd" />
    </>
  );
}

export default function TokenScene({ className = "", onReady }: { className?: string; onReady?: () => void }) {
  const reduced = useReducedMotion();
  const host = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    if (!host.current) return;
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { threshold: 0 });
    io.observe(host.current);
    return () => io.disconnect();
  }, []);

  const glb = config.assets?.mascot3d ?? null;
  const style = config.hero?.mascot ?? "auto";
  const useGlb = style === "glb" || (style === "auto" && Boolean(glb));

  return (
    <div ref={host} className={`relative h-full w-full ${className}`} aria-hidden>
      <Canvas
        // 1.25 rather than 1.5: the scene is a chest and four 34px coins, and the fill cost scales with
        // the square of this. The background canvas already renders at 0.75.
        dpr={[1, 1.25]}
        camera={{ position: [0, 0, useGlb && glb ? CHEST_CAMERA_Z : 6.5], fov: 35 }}
        gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
        // Only visibility gates the loop. Tying it to reduced motion as well meant the scene stopped
        // redrawing entirely on machines with that setting on -- the chest painted once and then froze,
        // and hovering it did nothing, because nothing ever asked for another frame.
        frameloop={visible ? "always" : "demand"}
        shadows={false}
        onCreated={({ gl }) => {
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.1;
        }}
      >
        <Lights />
        <Suspense fallback={null}>
          {useGlb && glb ? <ChestScene url={glb} reduced={reduced} /> : <Coin reduced={reduced} />}
          {onReady && <ReadySignal onReady={onReady} />}
        </Suspense>
      </Canvas>
    </div>
  );
}
