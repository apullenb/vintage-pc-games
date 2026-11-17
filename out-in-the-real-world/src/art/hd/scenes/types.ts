// An HD scene painting: the same layer concept as the pixel scenes (cached static
// layers + small animated layers, optional foreground and night lights), painted in
// logical 192x108 units on an HD canvas.
import type { Light } from '../../px.ts';
import type { Ctx, RGB } from '../kit.ts';

export interface HDSpec {
  player: number;
  npc: number;
  floor: number;
  bg: (x: Ctx) => void;
  anim?: (x: Ctx, t: number) => void;
  mid?: (x: Ctx) => void;
  anim2?: (x: Ctx, t: number) => void;
  fg?: (x: Ctx) => void;
  fgAnim?: (x: Ctx, t: number) => void;
  lights?: (t: number) => Light[];
  ambient?: RGB;
  fog?: number; // depth haze strength over the background
  fogColor?: string;
  horizon?: number; // logical y where the haze is thickest
  bloom?: number; // post-fx bloom multiplier
  windows?: [number, number, number, number][]; // windows that show the sky (weather/sunbeams)
}
export type HDFactory = (o: { night: boolean }) => HDSpec;
