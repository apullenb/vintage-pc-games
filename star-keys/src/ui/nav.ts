import type { RunStats } from '../types';
import type { NewBests } from './save';

export interface PlayResult {
  levelIndex: number;
  won: boolean;
  stars: number;
  stats: RunStats;
  hpLeft: number;
  newBest: NewBests | null; // set on wins
}

export interface Nav {
  title(): void;
  map(focus?: number): void;
  brief(levelIndex: number): void;
  play(levelIndex: number): void;
  results(r: PlayResult): void;
}
