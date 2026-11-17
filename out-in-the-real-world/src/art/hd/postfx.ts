// Post-processing for the HD scene: one cheap WebGL pass (soft bloom on bright
// lights, depth-fog tint, per-time-of-day color grade, vignette, anti-banding
// dither). A single shared WebGL canvas serves every scene canvas on the page, so
// there is never more than one GL context. Falls back to a 2D approximation when
// WebGL is unavailable or the context is lost.
import type { TimeOfDay } from '../atmos.ts';

export interface FxParams {
  bloom: number; // 0..1
  threshold: number; // luminance where bloom starts
  lift: [number, number, number];
  gain: [number, number, number];
  sat: number;
  contrast: number;
  fog: number; // 0..1
  fogColor: [number, number, number];
  horizon: number; // 0..1 from the top: fog is full above this line, fades toward the bottom
  vignette: number;
}

const GRADES: Record<TimeOfDay, Pick<FxParams, 'lift' | 'gain' | 'sat' | 'contrast' | 'bloom' | 'threshold'>> = {
  day: { lift: [0.0, 0.0, 0.015], gain: [1.02, 1.01, 0.99], sat: 1.14, contrast: 1.05, bloom: 0.3, threshold: 0.9 },
  morning: { lift: [0.02, 0.01, 0.035], gain: [1.03, 1.0, 1.0], sat: 1.1, contrast: 1.03, bloom: 0.4, threshold: 0.86 },
  golden: { lift: [0.03, 0.0, 0.03], gain: [1.07, 0.99, 0.9], sat: 1.18, contrast: 1.06, bloom: 0.5, threshold: 0.8 },
  evening: { lift: [0.035, 0.0, 0.05], gain: [1.04, 0.95, 0.97], sat: 1.12, contrast: 1.06, bloom: 0.5, threshold: 0.74 },
  night: { lift: [0.0, 0.01, 0.045], gain: [0.95, 0.98, 1.08], sat: 1.08, contrast: 1.08, bloom: 0.6, threshold: 0.62 },
};

export function fxFor(tod: TimeOfDay, o: { fog?: number; fogColor?: string; horizon?: number; bloom?: number; night?: boolean } = {}): FxParams {
  const g = GRADES[o.night ? 'night' : tod];
  const fc = o.fogColor ?? '#c8d0e8';
  const n = parseInt(fc.slice(1, 7), 16);
  return {
    ...g,
    bloom: g.bloom * (o.bloom ?? 1),
    fog: o.fog ?? 0.06,
    fogColor: [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255],
    horizon: o.horizon ?? 0.6,
    vignette: 0.32,
  };
}

const VS = `attribute vec2 p; varying vec2 v; void main(){ v = vec2(p.x*0.5+0.5, 0.5-p.y*0.5); gl_Position = vec4(p,0.0,1.0); }`;
const FS = `precision mediump float;
uniform sampler2D t; uniform vec2 px;
uniform float bloom, thr, sat, con, vig, fog, hor;
uniform vec3 lift, gain, fogc;
varying vec2 v;
vec3 bright(vec2 uv){ vec3 c = texture2D(t, uv).rgb; float l = dot(c, vec3(0.3, 0.55, 0.15)); return c * smoothstep(thr, 1.0, l); }
void main(){
  vec3 c = texture2D(t, v).rgb;
  vec3 b = vec3(0.0);
  for (int i = 0; i < 8; i++) {
    float a = float(i) * 0.785398 + 0.39;
    vec2 d = vec2(cos(a), sin(a)) * px;
    b += bright(v + d * 4.0);
    b += bright(v + d * 10.0) * 0.7;
  }
  c += b * (bloom / 13.6);
  float depth = 1.0 - smoothstep(hor, 1.0, v.y);
  c = mix(c, fogc, fog * depth);
  c = lift + c * (gain - lift);
  float l = dot(c, vec3(0.299, 0.587, 0.114));
  c = mix(vec3(l), c, sat);
  c = (c - 0.5) * con + 0.5;
  vec2 q = (v - 0.5) * vec2(1.0, 0.92);
  c *= 1.0 - vig * smoothstep(0.32, 0.78, length(q));
  c += (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) / 160.0;
  gl_FragColor = vec4(c, 1.0);
}`;

interface GLState {
  c: HTMLCanvasElement;
  gl: WebGLRenderingContext;
  u: Record<string, WebGLUniformLocation | null>;
  tex: WebGLTexture;
}
let G: GLState | null = null;
let failed = false;

function initGL(): GLState | null {
  if (failed) return null;
  if (G) return G;
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl', { alpha: false, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: true, premultipliedAlpha: false }) as WebGLRenderingContext | null;
    if (!gl) throw new Error('no webgl');
    const sh = (type: number, src: string): WebGLShader => {
      const s = gl.createShader(type);
      if (!s) throw new Error('shader');
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? 'compile');
      return s;
    };
    const pr = gl.createProgram();
    if (!pr) throw new Error('program');
    gl.attachShader(pr, sh(gl.VERTEX_SHADER, VS));
    gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(pr);
    if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error('link');
    gl.useProgram(pr);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(pr, 'p');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const tex = gl.createTexture();
    if (!tex) throw new Error('texture');
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const u: GLState['u'] = {};
    for (const n of ['t', 'px', 'bloom', 'thr', 'sat', 'con', 'vig', 'fog', 'hor', 'lift', 'gain', 'fogc']) u[n] = gl.getUniformLocation(pr, n);
    c.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      failed = true;
      G = null;
    });
    G = { c, gl, u, tex };
    return G;
  } catch {
    failed = true;
    return null;
  }
}

// 2D fallback: a soft screen-blended glow from a downsampled copy, fog wash, vignette.
let small: HTMLCanvasElement | null = null;
function fallback(src: HTMLCanvasElement, dst: CanvasRenderingContext2D, p: FxParams): void {
  const w = dst.canvas.width;
  const h = dst.canvas.height;
  dst.save();
  dst.setTransform(1, 0, 0, 1, 0, 0);
  dst.globalCompositeOperation = 'source-over';
  dst.drawImage(src, 0, 0, w, h);
  if (p.bloom > 0) {
    if (!small) {
      small = document.createElement('canvas');
      small.width = 64;
      small.height = 36;
    }
    const sx = small.getContext('2d');
    if (sx) {
      sx.imageSmoothingEnabled = true;
      sx.drawImage(src, 0, 0, 64, 36);
      dst.globalCompositeOperation = 'screen';
      dst.globalAlpha = Math.min(0.35, p.bloom * 0.28);
      dst.imageSmoothingEnabled = true;
      dst.drawImage(small, 0, 0, w, h);
      dst.globalAlpha = 1;
    }
  }
  dst.globalCompositeOperation = 'source-over';
  if (p.fog > 0) {
    const [r, g, b] = p.fogColor.map((v) => Math.round(v * 255));
    const gr = dst.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, `rgba(${r},${g},${b},${p.fog})`);
    gr.addColorStop(Math.max(0, Math.min(1, p.horizon)), `rgba(${r},${g},${b},${p.fog})`);
    gr.addColorStop(1, `rgba(${r},${g},${b},0)`);
    dst.fillStyle = gr;
    dst.fillRect(0, 0, w, h);
  }
  const vg = dst.createRadialGradient(w / 2, h / 2, h * 0.35, w / 2, h / 2, w * 0.62);
  vg.addColorStop(0, 'rgba(16,8,28,0)');
  vg.addColorStop(1, `rgba(16,8,28,${(p.vignette * 0.9).toFixed(3)})`);
  dst.fillStyle = vg;
  dst.fillRect(0, 0, w, h);
  dst.restore();
}

let forced2D = false;
// For testing/debug: force the 2D fallback.
export function setPostFx2D(v: boolean): void {
  forced2D = v;
}

// Render src through the post pass into dst (same size).
export function postFx(src: HTMLCanvasElement, dst: CanvasRenderingContext2D, p: FxParams): void {
  const g = forced2D ? null : initGL();
  if (!g) {
    fallback(src, dst, p);
    return;
  }
  const { gl, u, c } = g;
  if (c.width !== src.width || c.height !== src.height) {
    c.width = src.width;
    c.height = src.height;
  }
  gl.viewport(0, 0, c.width, c.height);
  try {
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
  } catch {
    failed = true;
    fallback(src, dst, p);
    return;
  }
  gl.uniform1i(u.t, 0);
  gl.uniform2f(u.px, 1 / c.width, 1 / c.height);
  gl.uniform1f(u.bloom, p.bloom);
  gl.uniform1f(u.thr, p.threshold);
  gl.uniform1f(u.sat, p.sat);
  gl.uniform1f(u.con, p.contrast);
  gl.uniform1f(u.vig, p.vignette);
  gl.uniform1f(u.fog, p.fog);
  gl.uniform1f(u.hor, p.horizon);
  gl.uniform3fv(u.lift, p.lift);
  gl.uniform3fv(u.gain, p.gain);
  gl.uniform3fv(u.fogc, p.fogColor);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  if (gl.isContextLost()) {
    fallback(src, dst, p);
    return;
  }
  dst.save();
  dst.setTransform(1, 0, 0, 1, 0, 0);
  dst.globalCompositeOperation = 'copy';
  dst.drawImage(c, 0, 0, dst.canvas.width, dst.canvas.height);
  dst.restore();
}
