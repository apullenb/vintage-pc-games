// Full-window pixel starfield behind the menus (paused during play).
import { currentScale, onLayoutChange } from './scale';

interface Star {
  x: number;
  y: number;
  z: number; // 1 near .. 3 far
  c: string;
  tw: number; // twinkle phase
}

const COLORS = ['#ffffff', '#cfe8ff', '#8ff6ff', '#ffd98a', '#c9b6ff'];

export class Starfield {
  readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private stars: Star[] = [];
  private nebula: HTMLCanvasElement | null = null;
  private w = 0;
  private h = 0;
  private raf = 0;
  private running = false;
  private last = 0;
  private t = 0;
  private shoot: { x: number; y: number; vx: number; vy: number; life: number } | null = null;

  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'starfield';
    this.ctx = this.canvas.getContext('2d')!;
    this.resize();
    onLayoutChange(() => this.resize());
  }

  private resize(): void {
    const px = Math.max(1, Math.round(currentScale()));
    const w = Math.ceil(window.innerWidth / px);
    const h = Math.ceil(window.innerHeight / px);
    if (w === this.w && h === this.h) return;
    this.w = this.canvas.width = w;
    this.h = this.canvas.height = h;
    const n = Math.round((w * h) / 260);
    this.stars = [];
    for (let i = 0; i < n; i++) {
      this.stars.push({
        x: Math.random() * w,
        y: Math.random() * h,
        z: 1 + Math.floor(Math.random() * 3),
        c: COLORS[Math.floor(Math.random() * COLORS.length)],
        tw: Math.random() * Math.PI * 2,
      });
    }
    this.nebula = this.makeNebula(w, h);
    if (!this.running) this.draw(0);
  }

  // Soft blobs of indigo/teal dust, dithered to pixels.
  private makeNebula(w: number, h: number): HTMLCanvasElement {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const x = c.getContext('2d')!;
    const g = x.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#060818');
    g.addColorStop(0.6, '#0b1033');
    g.addColorStop(1, '#151a4a');
    x.fillStyle = g;
    x.fillRect(0, 0, w, h);
    const blobs: [number, number, number, string][] = [
      [0.2, 0.3, 0.35, 'rgba(90,60,200,0.18)'],
      [0.8, 0.7, 0.4, 'rgba(40,180,220,0.10)'],
      [0.65, 0.2, 0.25, 'rgba(255,140,80,0.07)'],
    ];
    for (const [bx, by, r, col] of blobs) {
      const rg = x.createRadialGradient(bx * w, by * h, 0, bx * w, by * h, r * Math.max(w, h));
      rg.addColorStop(0, col);
      rg.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = rg;
      x.fillRect(0, 0, w, h);
    }
    return c;
  }

  setRunning(on: boolean): void {
    this.canvas.style.visibility = on ? 'visible' : 'hidden';
    if (on === this.running) return;
    this.running = on;
    if (on) {
      this.last = performance.now();
      const loop = (now: number): void => {
        if (!this.running) return;
        this.raf = requestAnimationFrame(loop);
        const dt = Math.min(0.1, (now - this.last) / 1000);
        this.last = now;
        this.draw(dt);
      };
      this.raf = requestAnimationFrame(loop);
    } else {
      cancelAnimationFrame(this.raf);
    }
  }

  private draw(dt: number): void {
    const { ctx, w, h } = this;
    this.t += dt;
    if (this.nebula) ctx.drawImage(this.nebula, 0, 0);
    for (const s of this.stars) {
      s.x -= (dt * 6) / s.z;
      if (s.x < 0) s.x += w;
      const tw = Math.sin(this.t * (2 / s.z) + s.tw);
      if (s.z === 3 && tw < -0.6) continue;
      ctx.fillStyle = s.c;
      const x = Math.floor(s.x);
      const y = Math.floor(s.y);
      ctx.fillRect(x, y, 1, 1);
      if (s.z === 1 && tw > 0.85) {
        ctx.globalAlpha = 0.5;
        ctx.fillRect(x - 1, y, 3, 1);
        ctx.fillRect(x, y - 1, 1, 3);
        ctx.globalAlpha = 1;
      }
    }
    // occasional shooting star
    if (!this.shoot && dt > 0 && Math.random() < dt * 0.15) {
      this.shoot = { x: Math.random() * w, y: Math.random() * h * 0.5, vx: -90 - Math.random() * 60, vy: 40, life: 0.9 };
    }
    const sh = this.shoot;
    if (sh) {
      sh.x += sh.vx * dt;
      sh.y += sh.vy * dt;
      sh.life -= dt;
      for (let i = 0; i < 8; i++) {
        ctx.globalAlpha = Math.max(0, sh.life) * (1 - i / 8);
        ctx.fillStyle = i < 2 ? '#ffffff' : '#8ff6ff';
        ctx.fillRect(Math.floor(sh.x - (sh.vx * i) / 90), Math.floor(sh.y - (sh.vy * i) / 90), 1, 1);
      }
      ctx.globalAlpha = 1;
      if (sh.life <= 0) this.shoot = null;
    }
  }
}
