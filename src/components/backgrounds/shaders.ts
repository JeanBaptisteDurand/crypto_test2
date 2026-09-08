import type { ShaderPreset } from "../../lib/config";

/**
 * Fragment shader presets. All receive:
 *   u_time (s), u_res (px), u_bg / u_c1 / u_c2 (rgb 0..1), u_mouse (0..1)
 * Add a preset: write GLSL here, add its key to ShaderPreset in lib/config.ts and to the schema.
 * Keep them cheap: they run full screen on phones. No loops over ~24 iterations.
 */

const common = /* glsl */ `#version 300 es
precision highp float;
out vec4 fragColor;
uniform float u_time;
uniform vec2 u_res;
uniform vec3 u_bg;
uniform vec3 u_c1;
uniform vec3 u_c2;
uniform vec2 u_mouse;
uniform vec2 u_focus;
uniform sampler2D u_image;
uniform float u_hasImage;
uniform float u_imgAspect;

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
vec2 hash22(vec2 p) {
  float n = hash21(p);
  return vec2(n, hash21(p + n));
}
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  mat2 rot = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < 5; i++) {
    v += a * noise(p);
    p = rot * p * 2.0 + 10.0;
    a *= 0.5;
  }
  return v;
}
`;

const aurora = /* glsl */ `
void main() {
  vec2 uv = gl_FragCoord.xy / u_res;
  vec2 p = (gl_FragCoord.xy - 0.5 * u_res) / u_res.y;
  float t = u_time * 0.08;

  // Slow domain-warped curtains
  vec2 q = vec2(fbm(p * 1.4 + t), fbm(p * 1.4 - t * 0.7 + 3.1));
  float band = fbm(p * 2.0 + q * 1.6 + vec2(0.0, t * 2.0));
  float curtain = smoothstep(0.35, 0.85, band) * (1.0 - smoothstep(0.1, 0.9, uv.y * 0.9 + 0.1 - q.y * 0.4));

  vec3 col = u_bg;
  // Restrained: the curtains tint the background, they do not light it. Anything above ~0.5 on u_c1
  // reads as neon on a saturated accent.
  col += u_c1 * curtain * 0.5;
  col += u_c2 * smoothstep(0.5, 0.95, fbm(p * 1.2 - q + t)) * 0.38 * (1.0 - uv.y);
  // Soft horizon glow, warm side only
  col += u_c2 * 0.13 * exp(-abs(p.y + 0.35) * 6.0);
  // The hero's copy sits on the left; the 3D scene has the right. Calm the left so the curtains never
  // compete with text, and leave the glow where it only lights the chest. Measured: the lower-left corner
  // was reaching #373920, which put muted text at 4.19:1, under AA.
  col *= 1.0 - 0.30 * smoothstep(0.60, 0.0, uv.x);
  // Grain
  col += (hash21(gl_FragCoord.xy + u_time) - 0.5) * 0.03;
  // Vignette
  col *= 1.0 - 0.35 * dot(p, p);
  fragColor = vec4(col, 1.0);
}
`;

const liquid = /* glsl */ `
void main() {
  vec2 p = (gl_FragCoord.xy - 0.5 * u_res) / u_res.y;
  float t = u_time * 0.12;
  vec2 m = (u_mouse - 0.5) * 0.4;

  // Metaball-style blobs drifting through domain warp
  vec2 w = p + 0.35 * vec2(fbm(p * 1.5 + t), fbm(p * 1.5 - t + 7.0)) - 0.175;
  float d1 = length(w - vec2(sin(t * 1.3) * 0.4 + m.x, cos(t * 0.9) * 0.3 + m.y));
  float d2 = length(w - vec2(cos(t * 1.1 + 2.0) * 0.5, sin(t * 0.7 + 1.0) * 0.35));
  float d3 = length(w - vec2(sin(t * 0.6 + 4.0) * 0.6, cos(t * 1.4 + 3.0) * 0.4));
  float field = 0.12 / (d1 + 0.05) + 0.1 / (d2 + 0.05) + 0.09 / (d3 + 0.05);

  // Soft halo → dense core → thin bright rim, all continuous so blobs read as liquid, not flat discs
  float halo = smoothstep(0.25, 1.1, field);
  float core = smoothstep(0.9, 1.9, field);
  float rim = exp(-abs(field - 1.05) * 7.0);

  vec3 col = u_bg;
  col = mix(col, u_c2 * 0.55, halo * 0.75);
  col = mix(col, mix(u_c2, u_c1, 0.5) * 0.85, core * 0.9);
  col += u_c1 * rim * 0.35;
  col += u_c1 * 0.05 * fbm(p * 3.0 + t);
  col += (hash21(gl_FragCoord.xy + u_time) - 0.5) * 0.03;
  col *= 1.0 - 0.3 * dot(p, p);
  fragColor = vec4(col, 1.0);
}
`;

const grid = /* glsl */ `
/** Night grid: a clear night sky lifting towards the horizon, over a water-green sea line, with a gold
 *  floor. Tuned to the warm dark palette -- the sky is the background's own plum opened up rather than a
 *  blue, and the sea line is a darkened form of the accent, so no colour enters that is not in the palette. */
const vec3 SKY_HIGH = vec3(0.055, 0.043, 0.075);
const vec3 SKY_LOW  = vec3(0.153, 0.118, 0.204);
const vec3 SEA      = vec3(0.086, 0.278, 0.216);

void main() {
  vec2 uv = gl_FragCoord.xy / u_res;
  vec2 p = (gl_FragCoord.xy - 0.5 * u_res) / u_res.y;
  float t = u_time * 0.5;

  // The floor should own a real share of the frame, but the lit horizon band must stay below the copy:
  // at -0.14 it sat straight behind the countdown and dropped text to 2.0:1. -0.20 puts it just under the
  // CTAs, and the band itself is dimmer and wider so it lights rather than glares.
  float horizon = -0.13;
  float y = p.y - horizon;

  // Clear night sky: deep overhead, lifting to the lit blue of the horizon.
  vec3 col = mix(SKY_LOW, SKY_HIGH, smoothstep(0.0, 0.85, y));
  col = mix(u_bg, col, step(0.0, y));

  if (y < 0.0) {
    float depth = 1.0 / (-y + 0.02);
    vec2 g = vec2(p.x * depth, depth * 0.6 + t);
    vec2 cell = abs(fract(g) - 0.5);
    float line = 1.0 - smoothstep(0.0, 0.06 * depth * 0.15 + 0.01, min(cell.x, cell.y));
    float fade = exp(-(-y) * 0.2) * smoothstep(0.0, 0.15, -y);
    // Sea floor tinted teal, then the gold lines *replacing* it rather than adding to it: added on top of
    // teal the gold turned yellow-green, which is not the gold grid asked for.
    col = mix(col, SEA, 0.22 * fade);
    col = mix(col, u_c2, clamp(line * fade * 0.85, 0.0, 1.0));
    col += u_c2 * 0.03 * fade;
  }

  // Horizon: teal water line with a thin gold rim just above it.
  col += SEA * 0.26 * exp(-abs(y) * 9.0);
  col += u_c2 * 0.11 * exp(-abs(y) * 26.0);

  // Stars in the upper sky, and gold dust drifting just over the floor.
  vec2 sp = floor(gl_FragCoord.xy / 3.0);
  float twinkle = 0.5 + 0.5 * sin(u_time * 1.6 + hash21(sp) * 30.0);
  col += step(0.9986, hash21(sp)) * step(0.05, y) * twinkle * 0.55;
  col += u_c2 * step(0.9990, hash21(sp + 7.0)) * step(y, 0.0) * twinkle * 0.30;

  col += (hash21(gl_FragCoord.xy + u_time) - 0.5) * 0.025;
  // Keep the copy side calm so text never competes with the grid.
  col *= 1.0 - 0.80 * smoothstep(0.72, 0.0, uv.x);
  col *= 1.0 - 0.25 * dot(p, p);
  fragColor = vec4(col, 1.0);
}
`;

const particles = /* glsl */ `
float layer(vec2 uv, float scale, float speed, float seed) {
  uv *= scale;
  uv.y += u_time * speed;
  vec2 id = floor(uv);
  vec2 f = fract(uv) - 0.5;
  float acc = 0.0;
  for (int yy = -1; yy <= 1; yy++) {
    for (int xx = -1; xx <= 1; xx++) {
      vec2 o = vec2(float(xx), float(yy));
      vec2 h = hash22(id + o + seed);
      vec2 pos = o + (h - 0.5) * 0.8 + 0.1 * vec2(sin(u_time * (0.5 + h.x)), cos(u_time * (0.4 + h.y)));
      float d = length(f - pos);
      float size = 0.02 + 0.05 * h.y;
      acc += smoothstep(size, 0.0, d) * (0.4 + 0.6 * h.x);
    }
  }
  return acc;
}
void main() {
  vec2 uv = gl_FragCoord.xy / u_res;
  vec2 p = (gl_FragCoord.xy - 0.5 * u_res) / u_res.y;
  vec2 par = (u_mouse - 0.5) * 0.03;

  vec3 col = u_bg;
  // Backdrop glow
  col += u_c2 * 0.18 * exp(-length(p - vec2(0.0, -0.1)) * 1.8);
  // Three parallax layers
  col += u_c1 * 0.35 * layer(uv + par * 0.5, 6.0, 0.02, 1.0);
  col += mix(u_c1, u_c2, 0.5) * 0.6 * layer(uv + par, 3.5, 0.04, 2.0);
  col += u_c2 * 0.9 * layer(uv + par * 2.0, 2.0, 0.07, 3.0);
  col += (hash21(gl_FragCoord.xy + u_time) - 0.5) * 0.025;
  col *= 1.0 - 0.3 * dot(p, p);
  fragColor = vec4(col, 1.0);
}
`;

const noisePreset = /* glsl */ `
void main() {
  vec2 uv = gl_FragCoord.xy / u_res;
  vec2 p = (gl_FragCoord.xy - 0.5 * u_res) / u_res.y;
  float t = u_time * 0.05;

  // Two soft color fields slowly breathing, film grain on top
  float a = fbm(p * 1.1 + vec2(t, -t));
  float b = fbm(p * 0.9 - vec2(t * 0.7, t * 0.4) + 5.0);
  vec3 col = u_bg;
  col = mix(col, u_c1 * 0.55, smoothstep(0.45, 0.8, a) * (1.0 - uv.y * 0.6));
  col = mix(col, u_c2 * 0.55, smoothstep(0.5, 0.85, b) * uv.y);
  // Grain, stronger than the other presets: this preset is about texture
  float grain = hash21(gl_FragCoord.xy + fract(u_time) * 100.0) - 0.5;
  col += grain * 0.08;
  col *= 1.0 - 0.4 * dot(p, p);
  fragColor = vec4(col, 1.0);
}
`;


const pixel = /* glsl */ `
// Flat, institutional, pixel-exact. No gradient, no glow, no vignette, no grain.
// A faint dot grid (24 cells high), and exactly one accent pixel crossing the frame at mid height
// in discrete steps, then a pause, then again. Nothing else moves.
void main() {
  float cellsY = 24.0;
  float cell = u_res.y / cellsY;
  vec2 g = gl_FragCoord.xy / cell;         // grid coordinates
  vec2 id = floor(g);
  vec2 f = fract(g);

  vec3 col = u_bg;

  // Dot grid: a 2x2-ish square at the centre of every cell, very low contrast (about 6% of fg toward bg)
  float dotSize = 0.08;
  float mark = step(abs(f.x - 0.5), dotSize) * step(abs(f.y - 0.5), dotSize);
  col = mix(col, u_c1, mark * 0.10);

  // One travelling pixel: crosses in 6 s at 4 cells/s, then waits so the loop reads as deliberate.
  float cols = ceil(u_res.x / cell);
  float period = cols / 4.0 + 3.0;         // travel time + 3 s pause
  float tt = mod(u_time, period) * 4.0;    // cells travelled
  float px = floor(tt);
  float row = floor(cellsY * 0.62);        // slightly above the middle, under the headline
  float on = step(px, cols) * (1.0 - step(cols, px));
  float here = step(abs(id.x - px), 0.01) * step(abs(id.y - row), 0.01);
  // Hard square, 70% of the cell
  float inner = step(abs(f.x - 0.5), 0.35) * step(abs(f.y - 0.5), 0.35);
  col = mix(col, u_c1, here * inner * on);

  fragColor = vec4(col, 1.0);
}
`;


/**
 * Riso dither: an ordered-dither (Bayer) pass over a drifting flow field, quantised to a handful of levels
 * and drawn in chunky pixels. Reference the user gave: aidesigner.ai/backgrounds/dither. Rebuilt from the
 * technique rather than copied -- Bayer thresholding, level quantisation and a warped fbm flow field are
 * all standard pieces.
 *
 * Palette only: the levels ramp through u_bg -> accent -> accent2 -> cream, so it carries the site's colours
 * instead of a generic gradient.
 */
const dither = /* glsl */ `
// Compact ordered-dither thresholds. bayer2 is the classic 2x2 identity; stacking it gives 4x4.
float bayer2(vec2 a) { a = floor(a); return fract(a.x / 2.0 + a.y * a.y * 0.75); }
float bayer4(vec2 a) { return bayer2(0.5 * a) * 0.25 + bayer2(a); }

void main() {
  float PIXEL = 3.0;      // chunk size in device pixels
  float LEVELS = 6.0;     // quantisation steps
  float SCALE = 1.15;     // flow field zoom
  float ANGLE = 2.55;     // ribbon direction, radians

  // Snap to the chunk grid first: everything below is evaluated per chunk, so the bands stay crisp.
  vec2 frag = floor(gl_FragCoord.xy / PIXEL) * PIXEL;
  vec2 uv = frag / u_res;
  vec2 p = (frag - 0.5 * u_res) / u_res.y;

  float t = u_time * 0.14;
  vec2 dir = vec2(cos(ANGLE), sin(ANGLE));

  // The aura is pinned on the 3D chest. u_focus is measured from the live layout rather than assumed:
  // the page is a centred max-width container, so the chest's fraction of the viewport changes with the
  // screen, and a fixed value only lines up at one width.
  vec2 core = vec2((u_focus.x - 0.5) * u_res.x / u_res.y, u_focus.y - 0.5);

  vec2 toCore = p - core;
  float dist = length(toCore);
  float aura = exp(-dist * 2.6);

  // Ribbons bend as they come near the aura, then dissolve into it: the flow is pushed radially outward
  // by an amount that grows with the aura, so the waves break around it instead of running through.
  vec2 push = normalize(toCore + vec2(1e-5)) * aura * 0.42;
  vec2 q = p * SCALE + dir * t + push;
  float warp = fbm(q * 0.75 - dir * t * 0.4);
  float field = fbm(q + warp * 0.85 + vec2(0.0, t * 0.5));

  // Keep the procedural flow on its own: it is what sweeps across the picture and reveals it.
  float flow = field;
  vec3 srcColour = vec3(0.0);

  if (u_hasImage > 0.5) {
    // cover fit, so the picture is never squashed whatever the screen
    float scr = u_res.x / u_res.y;
    vec2 iuv = uv;
    if (scr > u_imgAspect) {
      iuv.y = (uv.y - 0.5) * (u_imgAspect / scr) + 0.5;
    } else {
      iuv.x = (uv.x - 0.5) * (scr / u_imgAspect) + 0.5;
    }
    // Sampled straight: no warp, no breath. Displacing the picture itself read as a cheap ripple filter
    // laid over it. What moves is the dither, and the window it opens.
    srcColour = texture(u_image, clamp(iuv, 0.002, 0.998)).rgb;
  }

  // The waves keep moving, but inside the aura they melt into it rather than crossing it.
  field = mix(field, 0.78, smoothstep(0.20, 0.86, aura));
  field += 0.34 * aura;
  // A picture's luminance sits higher and flatter than the procedural field, so it gets its own curve.
  field = clamp((field - 0.54) * 1.45 + 0.26, 0.0, 1.0);

  // Ordered dither, then quantise. The threshold is scaled by the step size so it dithers the boundary
  // between two levels rather than the whole range.
  float th = (bayer4(frag / PIXEL) - 0.5) / LEVELS;
  float v = clamp(field + th, 0.0, 1.0);
  v = floor(v * LEVELS) / (LEVELS - 1.0);

  // Palette ramp, deliberately short of the top: the brightest step is gold, never cream, so no band of
  // the background ever approaches the text's own luminance.
  // Gold carries the ramp; the accent is only a trace in the low steps. Giving the accent a whole band
  // put green across most of the frame, which is the thing this DA moved away from.
  vec3 col = u_bg;
  col = mix(col, mix(u_bg, u_c1, 0.16), smoothstep(0.0, 0.38, v));
  col = mix(col, mix(u_bg, u_c2, 0.34), smoothstep(0.34, 0.66, v));
  col = mix(col, mix(u_bg, u_c2, 0.72), smoothstep(0.62, 0.88, v));
  col = mix(col, u_c2 * 0.72, smoothstep(0.86, 1.0, v));

  if (u_hasImage > 0.5) {
    // The dither is rendered as levels of transparency rather than as flat colours: each quantised step
    // maps to its own opacity for the picture. So the image is never absent and never fully exposed --
    // the tramage itself is what makes it come and go. Since the field drifts, a given patch moves
    // through the steps over time and the picture breathes in and out of view.
    vec3 through = mix(srcColour, srcColour * mix(u_c2, u_c1, 0.3) * 1.6, 0.35) * 0.9;
    float alpha = mix(0.34, 0.98, v);
    // Over the copy and under the header the range is compressed, not switched off: still visible, just
    // faint enough to read on top of.
    float clear = (1.0 - smoothstep(0.66, 0.10, uv.x)) * (1.0 - smoothstep(0.80, 0.98, uv.y));
    alpha *= mix(0.22, 1.0, clear);
    col = mix(col, through, alpha);
  }

  // Keep the copy side calm so text never competes with the bands.
  // The header sits on the top edge and the copy on the left; both need the field held down under them.
  col *= 1.0 - 0.40 * smoothstep(0.86, 1.0, uv.y);
  col *= 1.0 - 0.60 * smoothstep(0.72, 0.0, uv.x);
  col *= 1.0 - 0.26 * dot(p, p);
  fragColor = vec4(col, 1.0);
}
`;

export const presets: Record<ShaderPreset, string> = {
  aurora: common + aurora,
  liquid: common + liquid,
  grid: common + grid,
  particles: common + particles,
  noise: common + noisePreset,
  pixel: common + pixel,
  dither: common + dither,
};

export const vertexShader = /* glsl */ `#version 300 es
in vec2 a_pos;
void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }
`;
