// Shapes for game content (scenes, activities, tasks, events). Content is code, so it can compute.
import type { ArtId, GameState, NpcId, PathId, PayMethod, SlotId } from '../engine/types.ts';

export type Data = Record<string, number | string>;
export type Txt = string | ((s: GameState, d: Data) => string);

export interface Choice {
  label: Txt;
  // Tradeoff line shown under the label. Use '✓' for perks, '✗' for risks, joined with ' · '.
  hint?: Txt;
  pay?: number | ((s: GameState, d: Data) => number);
  methods?: PayMethod[]; // default: checking, savings, card
  req?: (s: GameState, d: Data) => true | string; // string = why it is locked
  hide?: (s: GameState, d: Data) => boolean;
  do?: (s: GameState, d: Data, m?: PayMethod) => void;
  next?: string | null | ((s: GameState, d: Data) => string | null);
  result?: Txt;
  tip?: string; // real-life tip shown with the result
  // Bot preference: positive = the sensible choice, negative = reckless.
  bot?: number | ((s: GameState, d: Data) => number);
}

export interface SceneStep {
  text: Txt;
  speaker?: NpcId | ((s: GameState) => NpcId);
  art?: ArtId;
  choices: Choice[];
}

export interface Scene {
  id: string;
  title: Txt;
  art: ArtId | ((s: GameState) => ArtId);
  speaker?: NpcId;
  kind?: 'story' | 'task' | 'event' | 'offer' | 'appt';
  steps: Record<string, SceneStep>;
}

export interface Activity {
  id: string;
  name: Txt;
  icon: string;
  slots: SlotId[];
  desc: Txt;
  hint: (s: GameState, slot: SlotId) => string;
  avail?: (s: GameState, slot: SlotId) => true | string;
  hide?: (s: GameState) => boolean;
  task?: string; // mission this advances (shown with a star)
  run: (s: GameState, slot: SlotId) => void;
}

export interface Task {
  id: string;
  chapter: number;
  paths?: PathId[];
  title: Txt;
  desc: Txt;
  done: (s: GameState) => boolean;
  progress?: (s: GameState) => string;
  how: Txt; // which activity / where to do it
  optional?: boolean; // bonus objective
  failText?: Txt; // what happens if it's not done by the deadline
  onFail?: (s: GameState) => void;
  hide?: (s: GameState) => boolean;
}

export interface Chapter {
  title: string;
  subtitle: string;
  weeks: number;
  art: ArtId;
  intro: (s: GameState) => string;
}

export interface GameEvent {
  id: string; // scene id
  weight: number | ((s: GameState) => number);
  when?: (s: GameState) => boolean;
  once?: boolean;
  cooldown?: number; // weeks before it can repeat
  minWeek?: number;
}

export interface StartPath {
  id: PathId;
  name: string;
  tagline: string;
  perks: string[];
  risks: string[];
  art: ArtId;
  difficulty: 1 | 2 | 3;
}
