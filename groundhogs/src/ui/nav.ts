export interface PlayResult {
  levelIndex: number;
  won: boolean;
  saved: number;
  count: number;
  required: number;
  nuked?: boolean; // gave up via the nuke button
}

export interface Nav {
  title(): void;
  select(): void;
  brief(levelIndex: number): void;
  play(levelIndex: number): void;
  results(r: PlayResult): void;
}
