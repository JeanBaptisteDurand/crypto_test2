import { useEffect, useRef } from "react";
import { RESPECT_REDUCED_MOTION, type ShaderPreset } from "../../lib/config";
import { presets, vertexShader } from "./shaders";

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

interface Props {
  preset: ShaderPreset;
  palette: { bg: string; accent: string; accent2?: string };
  /** Render scale. 0.75 halves the fill cost with no visible loss behind text. */
  scale?: number;
  /** Where the effect should centre itself, in 0..1 of the canvas, y measured from the bottom. Used by the
   *  dither preset to sit its aura on the 3D chest. Hardcoding it only ever matched one screen width: the
   *  page is a centred, max-width container, so the chest's fraction of the viewport moves with the screen. */
  focus?: { x: number; y: number };
  /** Optional picture for presets that read one. The dither preset takes its luminance as the field, so the
   *  image supplies the shapes and the palette supplies the colour. */
  image?: string;
  className?: string;
}

/**
 * Zero-asset animated background. One full-screen WebGL2 quad running a fragment shader.
 * Pauses when offscreen, when the tab is hidden and when the user prefers reduced motion.
 * Falls back to the CSS gradient if WebGL2 is unavailable.
 */
export default function ShaderBackground({ preset, palette, scale, focus, image, className = "" }: Props) {
  const renderScale = scale ?? 0.75;
  const ref = useRef<HTMLCanvasElement>(null);
  // Read through a ref so a moving focus does not tear down the GL context.
  const focusRef = useRef({ x: 0.5, y: 0.5 });
  focusRef.current = focus ?? { x: 0.5, y: 0.5 };

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const reduced = RESPECT_REDUCED_MOTION && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const gl = canvas.getContext("webgl2", { antialias: false, alpha: false, powerPreference: "low-power" });
    if (!gl) {
      canvas.classList.add("bg-gradient-animated");
      return;
    }

    const compile = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        console.error("[ShaderBackground]", gl.getShaderInfoLog(s));
      }
      return s;
    };
    const prog = gl.createProgram()!;
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, vertexShader));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, presets[preset]));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.error("[ShaderBackground]", gl.getProgramInfoLog(prog));
      canvas.classList.add("bg-gradient-animated");
      return;
    }
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "a_pos");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    const u = {
      time: gl.getUniformLocation(prog, "u_time"),
      res: gl.getUniformLocation(prog, "u_res"),
      bg: gl.getUniformLocation(prog, "u_bg"),
      c1: gl.getUniformLocation(prog, "u_c1"),
      c2: gl.getUniformLocation(prog, "u_c2"),
      focus: gl.getUniformLocation(prog, "u_focus"),
      image: gl.getUniformLocation(prog, "u_image"),
      hasImage: gl.getUniformLocation(prog, "u_hasImage"),
      imgAspect: gl.getUniformLocation(prog, "u_imgAspect"),
      mouse: gl.getUniformLocation(prog, "u_mouse"),
    };
    gl.uniform3fv(u.bg, hexToRgb(palette.bg));
    gl.uniform3fv(u.c1, hexToRgb(palette.accent));
    gl.uniform3fv(u.c2, hexToRgb(palette.accent2 ?? palette.accent));

    const mouse = { x: 0.5, y: 0.5, tx: 0.5, ty: 0.5 };
    const onMove = (e: PointerEvent) => {
      mouse.tx = e.clientX / window.innerWidth;
      mouse.ty = 1 - e.clientY / window.innerHeight;
    };
    window.addEventListener("pointermove", onMove, { passive: true });

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2) * renderScale;
      const w = Math.floor(canvas.clientWidth * dpr);
      const h = Math.floor(canvas.clientHeight * dpr);
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        gl.viewport(0, 0, w, h);
      }
    };
    resize();
    window.addEventListener("resize", resize);

    // Optional picture. Uploaded once it decodes; until then the shader runs with u_hasImage 0 and falls
    // back to its own field, so nothing waits on the network.
    let tex: WebGLTexture | null = null;
    let imgAspect = 1.0;
    let hasImage = 0;
    if (image) {
      tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      const img = new Image();
      img.onload = () => {
        imgAspect = img.width / img.height;
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
        hasImage = 1;
      };
      img.src = image;
    }

    let visible = true;
    let raf = 0;
    const start = performance.now();
    const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting), { threshold: 0 });
    io.observe(canvas);
    const onVis = () => (visible = !document.hidden);
    document.addEventListener("visibilitychange", onVis);

    const frame = () => {
      raf = requestAnimationFrame(frame);
      if (!visible) return;
      mouse.x += (mouse.tx - mouse.x) * 0.05;
      mouse.y += (mouse.ty - mouse.y) * 0.05;
      const t = reduced ? 0 : (performance.now() - start) / 1000;
      gl.uniform1f(u.time, t);
      gl.uniform2f(u.res, canvas.width, canvas.height);
      gl.uniform2f(u.mouse, mouse.x, mouse.y);
      gl.uniform2f(u.focus, focusRef.current.x, focusRef.current.y);
      gl.uniform1f(u.hasImage, hasImage);
      gl.uniform1f(u.imgAspect, imgAspect);
      if (tex) {
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.uniform1i(u.image, 0);
      }
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      if (reduced) cancelAnimationFrame(raf);
    };
    frame();

    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("visibilitychange", onVis);
      if (tex) gl.deleteTexture(tex);
      gl.deleteProgram(prog);
      gl.deleteBuffer(buf);
    };
  }, [preset, palette.bg, palette.accent, palette.accent2, renderScale, image]);

  return <canvas ref={ref} aria-hidden className={`h-full w-full ${className}`} />;
}
