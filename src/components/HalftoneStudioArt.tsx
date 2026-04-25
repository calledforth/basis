import { useEffect, useRef } from "react";

/** Mirrors Halftone Studio export — plasma + circular halftone dots */
export const HALFTONE_STUDIO_CONFIG = {
  mode: "halftone" as const,
  source: "plasma" as const,
  cellSize: 6,
  contrast: 0.49,
  brightness: 0.09,
  invert: false,
  gamma: 3,
  charset: " .:-=+*#%@",
  fontWeight: 500,
  dotShape: "circle" as const,
  dotScale: 1.36,
  rotation: 0,
  jitter: 0,
  speed: 1,
  paused: false,
  sourceScale: 1,
  sourceComplexity: 0.7,
  text: "ASCII",
  imageDataUrl: null as string | null,
  videoDataUrl: null as string | null,
  bg: "40 30% 92%",
  fg: "220 15% 8%",
  accent: "0 80% 55%",
  useAccent: false,
  accentThreshold: 0.75,
  glow: 0,
  width: 1280,
  height: 800
};

export type HalftoneStudioArtProps = {
  className?: string;
  configOverride?: Partial<typeof HALFTONE_STUDIO_CONFIG>;
};

function hslFromParts(parts: string): string {
  const p = parts.trim().split(/\s+/);
  if (p.length >= 3) return `hsl(${p[0]}, ${p[1]}, ${p[2]})`;
  return parts;
}

/**
 * Plasma in the same normalized space as a fixed Studio canvas (e.g. 1280×800):
 * map each screen cell to ref pixels, then scale by min(refW, refH) so blobs stay
 * isotropic and do not stretch when the hero strip is very wide.
 */
function plasma01(
  cx: number,
  cy: number,
  w: number,
  h: number,
  refW: number,
  refH: number,
  t: number,
  sourceScale: number,
  sourceComplexity: number,
  rotationRad: number
): number {
  const px = (cx / w) * refW;
  const py = (cy / h) * refH;
  const minDim = Math.min(refW, refH);
  let x = ((px - refW * 0.5) / minDim) * sourceScale * 14;
  let y = ((py - refH * 0.5) / minDim) * sourceScale * 14;
  const cos = Math.cos(rotationRad);
  const sin = Math.sin(rotationRad);
  const xr = x * cos - y * sin;
  const yr = x * sin + y * cos;
  x = xr;
  y = yr;

  const c = 0.4 + sourceComplexity * 4.2;
  const p =
    Math.sin(x * c + t) +
    Math.sin(y * c * 1.07 - t * 0.82) +
    Math.sin((x + y) * c * 0.88 + t * 0.45) +
    Math.sin(Math.hypot(x, y) * c * 0.62 + t * 0.55);
  return (p / 4 + 1) / 2;
}

function processLuminance(
  raw: number,
  contrast: number,
  brightness: number,
  invert: boolean,
  gamma: number
): number {
  let x = raw;
  if (invert) x = 1 - x;
  x = (x - 0.5) * (1 + contrast) + 0.5 + brightness;
  x = Math.max(0, Math.min(1, x));
  x = Math.pow(x, gamma);
  return Math.max(0, Math.min(1, x));
}

function hash01(n: number): number {
  const x = Math.sin(n) * 43758.5453123;
  return x - Math.floor(x);
}

/** Hero strip background — matches ink (fg): dark field, light dots from paper (bg) */
export const HALFTONE_HERO_BG_CSS = hslFromParts(HALFTONE_STUDIO_CONFIG.fg);

export function HalftoneStudioArt({ className, configOverride }: HalftoneStudioArtProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef(0);
  const reduceMotionRef = useRef(false);

  useEffect(() => {
    reduceMotionRef.current = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;

    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const cfg = { ...HALFTONE_STUDIO_CONFIG, ...configOverride };
    /* Studio preview: light dots on dark ground (paper = dot color, ink = canvas fill). */
    const canvasCss = hslFromParts(cfg.fg);
    const dotCss = hslFromParts(cfg.bg);
    let running = true;
    const rotationRad = (cfg.rotation * Math.PI) / 180;

    const paint = (nowMs: number) => {
      const w = wrap.clientWidth;
      const h = wrap.clientHeight;
      if (w < 2 || h < 2) return;

      const reduced = reduceMotionRef.current;
      const t = reduced ? 0 : nowMs * 0.001 * cfg.speed;

      ctx.fillStyle = canvasCss;
      ctx.fillRect(0, 0, w, h);

      const cell = cfg.cellSize;
      const cols = Math.max(4, Math.ceil(w / cell));
      const rows = Math.max(4, Math.ceil(h / cell));
      const maxR = (cell * 0.5 * cfg.dotScale * 0.98) | 0;

      ctx.fillStyle = dotCss;

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const cx = c * cell + cell * 0.5;
          const cy = r * cell + cell * 0.5;
          let jx = 0;
          let jy = 0;
          if (cfg.jitter > 0 && !reduced) {
            const j = cfg.jitter * cell;
            const s1 = c * 928371 + r * 48829;
            jx = (hash01(s1 + t * 3.1) - 0.5) * 2 * j;
            jy = (hash01(s1 * 1.7 + t * 2.4 + 19) - 0.5) * 2 * j;
          }

          const raw = plasma01(
            cx,
            cy,
            w,
            h,
            cfg.width,
            cfg.height,
            t,
            cfg.sourceScale,
            cfg.sourceComplexity,
            rotationRad
          );
          const lum = processLuminance(raw, cfg.contrast, cfg.brightness, cfg.invert, cfg.gamma);
          const radius = maxR * Math.sqrt(lum);
          if (radius < 0.15) continue;

          ctx.beginPath();
          ctx.arc(cx + jx, cy + jy, radius, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    };

    const layout = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = wrap.getBoundingClientRect();
      const wCss = Math.max(1, rect.width);
      const hCss = Math.max(1, rect.height);
      canvas.width = Math.floor(wCss * dpr);
      canvas.height = Math.floor(hCss * dpr);
      canvas.style.width = `${wCss}px`;
      canvas.style.height = `${hCss}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      if (reduceMotionRef.current || cfg.paused) {
        paint(0);
      } else {
        paint(performance.now());
      }
    };

    const draw = (now: number) => {
      if (!running) return;
      paint(now);
      if (!reduceMotionRef.current && !cfg.paused) {
        rafRef.current = requestAnimationFrame(draw);
      }
    };

    const ro = new ResizeObserver(() => layout());
    ro.observe(wrap);
    layout();

    if (!reduceMotionRef.current && !cfg.paused) {
      rafRef.current = requestAnimationFrame(draw);
    }

    return () => {
      running = false;
      cancelAnimationFrame(rafRef.current);
      ro.disconnect();
    };
  }, [configOverride]);

  return (
    <div ref={wrapRef} role="img" aria-label="Plasma halftone pattern" className={className}>
      <canvas
        ref={canvasRef}
        className="block h-full w-full [image-rendering:pixelated]"
        aria-hidden
      />
    </div>
  );
}
