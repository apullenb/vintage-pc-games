// Action mini-games: content side (what's at stake and what happens). The playable part lives in src/minigames/.
import type { ArtId, GameState, MiniResult } from '../../engine/types.ts';
import type { Data, Txt } from '../types.ts';

export interface MiniGameDef {
  id: string;
  title: Txt;
  how: Txt; // how to play, including controls (keyboard + touch)
  stakes: Txt; // what's riding on it, shown before playing
  art: ArtId; // backdrop for the intro card
  // Apply the outcome to the game state. Return the result text (and an optional real-life tip).
  // r.score is 0..1; r.played is false when the player hit Skip (score is then SKIP_SCORE).
  apply: (s: GameState, r: MiniResult, d: Data) => { text: string; tip?: string };
}
