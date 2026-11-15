// Registry of mini-game definitions. Each game lives in its own file.
import { busdash } from './busdash.ts';
import { delivery } from './delivery.ts';
import { flashcards } from './flashcards.ts';
import { grocery } from './grocery.ts';
import { haggle } from './haggle.ts';
import { moving } from './moving.ts';
import { roadtest } from './roadtest.ts';
import { shift } from './shift.ts';
import type { MiniGameDef } from './types.ts';

export const MINIGAME_LIST: MiniGameDef[] = [roadtest, delivery, shift, busdash, grocery, haggle, flashcards, moving];
export const MINIGAMES: Record<string, MiniGameDef> = Object.fromEntries(MINIGAME_LIST.map((m) => [m.id, m]));
export type { MiniGameDef };
