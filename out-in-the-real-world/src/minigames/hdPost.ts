// HD presenter for mini-game canvases: takes the game's (offscreen, high-res) 2D canvas and shows
// it on the visible canvas with a small WebGL post stack:
//   soft bilinear upscale + light edge smoothing -> bloom on bright pixels -> colour grade -> vignette.
// Without WebGL (or after a lost context) kit.tsx draws straight to the screen with cssGrade() instead.
// Everything is a handful of tiny full-screen GPU passes; no CPU pixel loops.

export interface PostOpts {
  bloom?: number; // bloom strength (0 = off). Default 0.35
  threshold?: number; // luminance where bloom starts (0..1). Default 0.72
  radius?: number; // bloom blur radius multiplier. Default 1
  saturation?: number; // 1 = unchanged. Default 1.12
  contrast?: number; // 1 = unchanged. Default 1.06
  warmth?: number; // -1..1 split-tone: + warm highlights / cool shadows. Default 0.15
  vignette?: number; // 0..1 edge darkening. Default 0.3
  smooth?: number; // 0..1 edge smoothing (softens hard pixel stair-steps). Default 0.35
  lift?: [number, number, number]; // added to shadows (0..0.1 typical). Default slight violet
}

export const POST_DEFAULTS: Required<PostOpts> = {
  bloom: 0.35,
  threshold: 0.72,
  radius: 1,
  saturation: 1.12,
  contrast: 1.06,
  warmth: 0.15,
  vignette: 0.3,
  smooth: 0.35,
  lift: [0.018, 0.012, 0.03],
};


export interface Presenter {
  present(): void;
  resize(): void;
  setOpts(o: PostOpts): void;
  destroy(): void;
  readonly kind: 'gl';
}

let glOk: boolean | null = null;
// One-time probe so we never put a GL context on the visible canvas unless it will work.
export function webglAvailable(): boolean {
  if (glOk !== null) return glOk;
  try {
    const c = document.createElement('canvas');
    const g = (c.getContext('webgl', { failIfMajorPerformanceCaveat: true }) ?? null) as WebGLRenderingContext | null;
    glOk = !!g;
    g?.getExtension('WEBGL_lose_context')?.loseContext();
  } catch {
    glOk = false;
  }
  return glOk;
}

const VS = `attribute vec2 p; varying vec2 v; void main(){ v = p * 0.5 + 0.5; gl_Position = vec4(p, 0.0, 1.0); }`;

// Downsample + soft-knee bright pass (4 bilinear taps = 16 texel box).
// (fy flips rows: the uploaded canvas is top-down, our render targets are bottom-up.)
const FS_BRIGHT = `precision mediump float; varying vec2 v; uniform sampler2D s; uniform vec2 px; uniform float th; uniform float fy;
void main(){
  vec2 u = vec2(v.x, mix(v.y, 1.0 - v.y, fy));
  vec3 c = texture2D(s, u + px * vec2(-1.0,-1.0)).rgb + texture2D(s, u + px * vec2(1.0,-1.0)).rgb
         + texture2D(s, u + px * vec2(-1.0, 1.0)).rgb + texture2D(s, u + px * vec2(1.0, 1.0)).rgb;
  c *= 0.25;
  float l = 0.5 * max(c.r, max(c.g, c.b)) + 0.5 * dot(c, vec3(0.299, 0.587, 0.114));
  float k = smoothstep(th, th + 0.25, l);
  gl_FragColor = vec4(c * k, 1.0);
}`;

// 9-tap gaussian using 5 bilinear fetches.
const FS_BLUR = `precision mediump float; varying vec2 v; uniform sampler2D s; uniform vec2 d;
void main(){
  vec3 c = texture2D(s, v).rgb * 0.2270270270;
  c += texture2D(s, v + d * 1.3846153846).rgb * 0.3162162162;
  c += texture2D(s, v - d * 1.3846153846).rgb * 0.3162162162;
  c += texture2D(s, v + d * 3.2307692308).rgb * 0.0702702703;
  c += texture2D(s, v - d * 3.2307692308).rgb * 0.0702702703;
  gl_FragColor = vec4(c, 1.0);
}`;

const FS_FINAL = `precision mediump float; varying vec2 v;
uniform sampler2D s; uniform sampler2D b1; uniform sampler2D b2;
uniform vec2 px; uniform float bloom; uniform float sat; uniform float con; uniform float warm;
uniform float vig; uniform float sm; uniform vec3 lift; uniform vec2 aspect;
void main(){
  vec2 u = vec2(v.x, 1.0 - v.y);
  vec3 c = texture2D(s, u).rgb;
  if (sm > 0.0) {
    vec3 n = texture2D(s, u + px * vec2(0.7, 0.7)).rgb + texture2D(s, u + px * vec2(-0.7, 0.7)).rgb
           + texture2D(s, u + px * vec2(0.7, -0.7)).rgb + texture2D(s, u + px * vec2(-0.7, -0.7)).rgb;
    c = mix(c, n * 0.25, sm);
  }
  vec3 bl = texture2D(b1, v).rgb * 0.6 + texture2D(b2, v).rgb * 0.9;
  c += bl * bloom;
  // grade: lift, contrast around mid grey, saturation, split tone
  c = c + lift * (1.0 - c);
  c = (c - 0.5) * con + 0.5;
  float l = dot(c, vec3(0.299, 0.587, 0.114));
  c = mix(vec3(l), c, sat);
  c += warm * vec3(0.06, 0.015, -0.05) * smoothstep(0.35, 1.0, l);
  c += warm * vec3(-0.025, 0.0, 0.035) * (1.0 - smoothstep(0.0, 0.45, l));
  // filmic-ish shoulder so bloom never clips harshly
  c = c / (1.0 + max(c - 0.85, 0.0) * 1.4);
  vec2 q = (v - 0.5) * aspect;
  float r = dot(q, q);
  c *= 1.0 - vig * smoothstep(0.12, 0.62, r);
  // tiny ordered dither against gradient banding
  float dth = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5;
  gl_FragColor = vec4(clamp(c, 0.0, 1.0) + dth / 255.0, 1.0);
}`;

interface Target {
  tex: WebGLTexture;
  fb: WebGLFramebuffer;
  w: number;
  h: number;
}

function compile(g: WebGLRenderingContext, fs: string): WebGLProgram | null {
  const mk = (type: number, src: string): WebGLShader | null => {
    const sh = g.createShader(type);
    if (!sh) return null;
    g.shaderSource(sh, src);
    g.compileShader(sh);
    if (!g.getShaderParameter(sh, g.COMPILE_STATUS)) return null;
    return sh;
  };
  const v = mk(g.VERTEX_SHADER, VS);
  const f = mk(g.FRAGMENT_SHADER, fs);
  if (!v || !f) return null;
  const p = g.createProgram();
  if (!p) return null;
  g.attachShader(p, v);
  g.attachShader(p, f);
  g.bindAttribLocation(p, 0, 'p');
  g.linkProgram(p);
  if (!g.getProgramParameter(p, g.LINK_STATUS)) return null;
  return p;
}

// Output resolution: the displayed size in device pixels, but never below the source and never more
// than 1.5x it (past that the browser's own bilinear scale-up looks the same and costs nothing).
function outSize(vis: HTMLCanvasElement, src: HTMLCanvasElement, low: boolean): [number, number] {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const cw = vis.clientWidth || src.width;
  let w = Math.round(cw * dpr);
  w = low ? src.width : Math.max(src.width, Math.min(Math.round(src.width * 1.5), 1600, w));
  const h = Math.round((w * src.height) / src.width);
  return [w, h];
}

export function glPresenter(vis: HTMLCanvasElement, src: HTMLCanvasElement, opts: PostOpts, onLost: () => void): Presenter | null {
  let g: WebGLRenderingContext | null = null;
  try {
    g = vis.getContext('webgl', { alpha: false, antialias: false, depth: false, stencil: false, premultipliedAlpha: false, preserveDrawingBuffer: false }) as WebGLRenderingContext | null;
  } catch {
    g = null;
  }
  if (!g) return null;
  const gl = g;
  const pBright = compile(gl, FS_BRIGHT);
  const pBlur = compile(gl, FS_BLUR);
  const pFinal = compile(gl, FS_FINAL);
  if (!pBright || !pBlur || !pFinal) return null;

  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  const mkTex = (w: number, h: number): WebGLTexture => {
    const t = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    if (w > 0) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    return t;
  };
  const mkTarget = (w: number, h: number): Target => {
    const tex = mkTex(w, h);
    const fb = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    return { tex, fb, w, h };
  };
  const srcTex = mkTex(0, 0);
  let sw = 0;
  let sh = 0;
  let a1: Target | null = null; // quarter res
  let b1: Target | null = null;
  let a2: Target | null = null; // eighth res
  let b2: Target | null = null;
  const freeT = (t: Target | null) => {
    if (!t) return;
    gl.deleteTexture(t.tex);
    gl.deleteFramebuffer(t.fb);
  };
  const ensureTargets = () => {
    if (sw === src.width && sh === src.height && a1) return;
    sw = src.width;
    sh = src.height;
    [a1, b1, a2, b2].forEach(freeT);
    const w1 = Math.max(8, Math.round(sw / 4));
    const h1 = Math.max(8, Math.round(sh / 4));
    const w2 = Math.max(4, Math.round(sw / 8));
    const h2 = Math.max(4, Math.round(sh / 8));
    a1 = mkTarget(w1, h1);
    b1 = mkTarget(w1, h1);
    a2 = mkTarget(w2, h2);
    b2 = mkTarget(w2, h2);
  };

  const U = (p: WebGLProgram, n: string) => gl.getUniformLocation(p, n);
  const uB = { s: U(pBright, 's'), px: U(pBright, 'px'), th: U(pBright, 'th'), fy: U(pBright, 'fy') };
  const uR = { s: U(pBlur, 's'), d: U(pBlur, 'd') };
  const uF = {
    s: U(pFinal, 's'),
    b1: U(pFinal, 'b1'),
    b2: U(pFinal, 'b2'),
    px: U(pFinal, 'px'),
    bloom: U(pFinal, 'bloom'),
    sat: U(pFinal, 'sat'),
    con: U(pFinal, 'con'),
    warm: U(pFinal, 'warm'),
    vig: U(pFinal, 'vig'),
    sm: U(pFinal, 'sm'),
    lift: U(pFinal, 'lift'),
    aspect: U(pFinal, 'aspect'),
  };

  let o: Required<PostOpts> = { ...POST_DEFAULTS, ...opts };
  let lost = false;
  // Quality governor: measured over 2.5 s windows; if the frame rate stays under ~40 fps, first drop
  // the bloom passes, then render at source size, then hand back to direct drawing.
  let winT = 0;
  let winN = 0;
  let cheap = false;
  let low = false;

  const pass = (t: Target | null) => {
    if (t) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, t.fb);
      gl.viewport(0, 0, t.w, t.h);
    } else {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, vis.width, vis.height);
    }
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  };
  const blur = (from: Target, tmp: Target, r: number) => {
    gl.useProgram(pBlur);
    gl.uniform1i(uR.s, 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, from.tex);
    gl.uniform2f(uR.d, r / from.w, 0);
    pass(tmp);
    gl.bindTexture(gl.TEXTURE_2D, tmp.tex);
    gl.uniform2f(uR.d, 0, r / from.h);
    pass(from);
  };

  const onLostEv = (e: Event) => {
    e.preventDefault();
    lost = true;
    onLost();
  };
  vis.addEventListener('webglcontextlost', onLostEv);

  const resize = () => {
    const [w, h] = outSize(vis, src, low);
    if (vis.width !== w) vis.width = w;
    if (vis.height !== h) vis.height = h;
  };
  resize();

  return {
    kind: 'gl',
    setOpts(n) {
      o = { ...POST_DEFAULTS, ...n };
    },
    resize,
    present() {
      if (lost || gl.isContextLost()) return;
      const now = performance.now();
      if (!winT) winT = now;
      winN++;
      const span = now - winT;
      if (span > 2500) {
        const fps = (winN * 1000) / span;
        winT = now;
        winN = 0;
        // (a long gap means the tab was hidden or the game paused: not a sample)
        if (fps < 40 && fps > 4) {
          if (low) {
            // still struggling: give up on the post pass and draw straight to the screen
            lost = true;
            onLost();
            return;
          }
          if (cheap) {
            low = true;
            resize();
          }
          cheap = true;
        }
      }
      ensureTargets();
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, srcTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
      const doBloom = o.bloom > 0 && !cheap && a1 && b1 && a2 && b2;
      if (doBloom) {
        gl.useProgram(pBright);
        gl.uniform1i(uB.s, 0);
        gl.uniform2f(uB.px, 1 / sw, 1 / sh);
        gl.uniform1f(uB.th, o.threshold);
        gl.uniform1f(uB.fy, 1);
        pass(a1!);
        blur(a1!, b1!, o.radius);
        // eighth-res level from the blurred quarter level, for a wide soft halo
        gl.useProgram(pBright);
        gl.bindTexture(gl.TEXTURE_2D, a1!.tex);
        gl.uniform2f(uB.px, 0.5 / a1!.w, 0.5 / a1!.h);
        gl.uniform1f(uB.th, -1);
        gl.uniform1f(uB.fy, 0);
        pass(a2!);
        blur(a2!, b2!, o.radius * 1.5);
      }
      gl.useProgram(pFinal);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, srcTex);
      gl.uniform1i(uF.s, 0);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, doBloom ? a1!.tex : null);
      gl.uniform1i(uF.b1, 1);
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, doBloom ? a2!.tex : null);
      gl.uniform1i(uF.b2, 2);
      gl.uniform2f(uF.px, 1 / sw, 1 / sh);
      gl.uniform1f(uF.bloom, doBloom ? o.bloom : 0);
      gl.uniform1f(uF.sat, o.saturation);
      gl.uniform1f(uF.con, o.contrast);
      gl.uniform1f(uF.warm, o.warmth);
      gl.uniform1f(uF.vig, o.vignette);
      gl.uniform1f(uF.sm, low ? 0 : o.smooth);
      gl.uniform3f(uF.lift, o.lift[0], o.lift[1], o.lift[2]);
      const ar = sw / sh;
      gl.uniform2f(uF.aspect, ar > 1 ? 1 : ar, ar > 1 ? 1 / ar : 1);
      pass(null);
      gl.activeTexture(gl.TEXTURE0);
    },
    destroy() {
      vis.removeEventListener('webglcontextlost', onLostEv);
      if (lost || gl.isContextLost()) return;
      [a1, b1, a2, b2].forEach(freeT);
      gl.deleteTexture(srcTex);
      gl.deleteBuffer(buf);
      gl.deleteProgram(pBright);
      gl.deleteProgram(pBlur);
      gl.deleteProgram(pFinal);
    },
  };
}

// The colour grade as a CSS filter, for the 2D fallback.
export function cssGrade(o: PostOpts): string {
  const p = { ...POST_DEFAULTS, ...o };
  return `saturate(${p.saturation.toFixed(2)}) contrast(${p.contrast.toFixed(2)})`;
}
