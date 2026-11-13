import type { GHState, Groundhog } from '../types';

const NAMES = [
  'PHIL', 'CHUCK', 'WIARTON', 'PUNXSY', 'HAZEL', 'BURDOCK', 'TATER', 'NUTMEG',
  'CLOVER', 'PIP', 'MOSS', 'BRAMBLE', 'SUNNY', 'WOODY', 'MARLOW', 'THISTLE',
  'PEBBLE', 'JUNIPER', 'ACORN', 'FERN', 'BISCUIT', 'DIGBY', 'MAPLE', 'SORREL',
];

const STATE_NAMES: Record<GHState, string> = {
  falling: 'FALLER',
  walking: 'WALKER',
  climbing: 'CLIMBER',
  hoisting: 'CLIMBER',
  gliding: 'GLIDER',
  sentry: 'SENTRY',
  planking: 'PLANKER',
  shrugging: 'SHRUGGER',
  tunneling: 'TUNNELER',
  burrowing: 'BURROWER',
  scraping: 'SCRAPER',
  splatting: 'SPLAT',
  drowning: 'SOGGY',
  exiting: 'HOME',
  poofing: 'POOF',
  planting: 'BOUNCER',
  launched: 'WHEEE',
  napping: 'NAPPER',
  saved: 'SAVED',
  dead: 'GONE',
};

export function hogName(g: Groundhog): string {
  return NAMES[g.id % NAMES.length];
}

// e.g. "PHIL WALKER +CLIMB +GLIDE"
export function hogLabel(g: Groundhog): string {
  let s = `${hogName(g)} ${STATE_NAMES[g.state]}`;
  if (g.isClimber && g.state !== 'climbing' && g.state !== 'hoisting') s += ' +CLIMB';
  if (g.isGlider && g.state !== 'gliding') s += ' +GLIDE';
  return s;
}
