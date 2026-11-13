// Groundhog frame data. All side views face right; anchor (ax, ay) = feet center.
// Letters g,G,l,v are reserved for the leaf palette.

export interface FrameDef {
  rows: readonly string[];
  ax: number;
  ay: number;
}

export const GH_PAL = {
  o: '#2b1a0f', // outline
  D: '#53311a', // darkest fur: ears, tail
  d: '#6a4021', // dark fur
  b: '#935f2f', // fur
  B: '#bd864b', // light fur / sheen
  h: '#d9bb8e', // grizzled tips, tail tip
  t: '#ecc993', // tan belly/muzzle
  T: '#c99d63', // tan shade
  c: '#fbeacb', // belly highlight
  e: '#0b0604', // eye
  i: '#ffffff', // eye catchlight
  w: '#fffaf0', // teeth
  n: '#3a1d17', // nose / open mouth
  r: '#e39782', // blush
  F: '#3f2414', // paws
  k: '#efe4c8', // claws
  p: '#d69a52', // plank
  P: '#8c5426', // plank grain
  x: '#f6f0e0', // dazed eye
  q: '#e2569f', // sprout cap
  Q: '#a8306f', // sprout cap shade
  s: '#f4e6c8', // sprout stem
} as const;

export const LEAF_PAL = {
  G: '#2c7a2c',
  g: '#5fbf41',
  l: '#a9e86c',
  v: '#3f8f2c',
} as const;

// Hardening napper: fur letters remapped to earthy mound tones.
export const HARD_PAL: Record<string, string> = {
  o: '#4a3b2e', D: '#6b5a49', d: '#6b5a49', b: '#8a7560', B: '#a8927a', h: '#b8a58c', t: '#9c8670', T: '#857059',
  c: '#a8927a', e: '#4a3b2e', i: '#8a7560', w: '#9c8670', n: '#4a3b2e', r: '#8a7560', F: '#5a4a3c', k: '#9c8670',
};

const f = (rows: readonly string[], ax?: number, ay?: number): FrameDef => ({
  rows,
  ax: ax ?? Math.floor(rows[0].length / 2),
  ay: ay ?? rows.length - 1,
});

// Set single pixels: [x, y, ch].
const put = (rows: readonly string[], pts: [number, number, string][]): string[] =>
  rows.map((r, y) => {
    let s = r;
    for (const [px, py, ch] of pts) if (py === y) s = s.padEnd(px + 1, '.').slice(0, px) + ch + s.slice(px + 1);
    return s;
  });

// ---------- side view: round head, big eye w/ catchlight, chubby belly, tail tuft ----------
const SIDE = [
  '....oooo...',
  '...oDbbBo..',
  '...obbBBio.',
  '..obbbbbetn',
  '..obbbbrtto',
  'hobBbbbbww.',
  'DobBbbbcto.',
  'Dobbbdbbto.',
  '.Dodddddo..',
];

// Walk: body bob + legs (2 rows under body).
function walk(bob: number, legs: [string, string]): FrameDef {
  const rows: string[] = [];
  const top = 1 - bob;
  for (let y = 0; y < 11; y++) {
    const bi = y - top;
    let row = bi >= 0 && bi < SIDE.length ? SIDE[bi] : '...........';
    const li = y - 9;
    if (li >= 0 && li < 2) row = overlay(legs[li], row);
    rows.push(row);
  }
  return f(rows, 5, 10);
}

// a drawn under b
function overlay(a: string, b: string): string {
  let s = '';
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const cb = b[i] ?? '.';
    s += cb !== '.' ? cb : (a[i] ?? '.');
  }
  return s;
}

export const WALK: FrameDef[] = [
  walk(0, ['...........', '.FF.....FFk']),
  walk(1, ['...d...d...', '..FF...FFk.']),
  walk(0, ['...........', '...FF.FFk..']),
  walk(1, ['....d..d...', '...FF..FFk.']),
];

// ---------- front view ----------
const FACE = [
  '..ooooo..',
  '.oDbBbDo.',
  '.obibibo.',
  '.orebero.',
  '.obtntbo.',
  '..otwto..',
];
const FEET_F = '.FkF.FkF.';
export const FRONT = [...FACE, '.obtctbo.', 'obbtttbbo', 'obbtttbbo', '.obbTbbo.', FEET_F];
export const FRONT_F: FrameDef = f(FRONT);

const FALL_FACE = [FACE[1], FACE[2], FACE[3], FACE[4], '..otnto..', '.obtctbo.', '.obtttbo.', '..obTbo..'];
export const FALL: FrameDef[] = [
  f(['k.......k', 'Fb.....bF', 'ob.ooo.bo', ...FALL_FACE, '..o...o..', '.FF...FF.']),
  f(['.k.....k.', '.Fo...oF.', 'ob.ooo.bo', ...FALL_FACE, '.o.....o.', '.FF...FF.']),
];

// Arms up holding the leaf stem; leaf drawn separately above row 0.
const HANG_BODY = [
  '...kvk...',
  '...FvF...',
  '..ob.bo..',
  '.obooobo.',
  FACE[1], FACE[2], FACE[3], FACE[4], FACE[5],
  '.obtctbo.',
  'obbtttbbo',
  '.obbTbbo.',
];
export const HANG: FrameDef[] = [f([...HANG_BODY, '..F...F..']), f([...HANG_BODY, '.F.....F.'])];

export const LEAF = [
  '....GGGGG....',
  '..GGgllggGG..',
  '.GglllgggggG.',
  'GgllgggvggggG',
  'GgggvvvvvvggG',
  'GGG.GGvGG.GGG',
  '......v......',
];

// Wall is to the right (col 9 = x+4).
const CLIMB_A = [
  '........Fk.',
  '...oooo.bk.',
  '..oDbbBoob.',
  '..obbBBio..',
  '.obbbbbetn.',
  '.obbbbrtto.',
  '..obBbbww..',
  '..obBbbbco.',
  '.Dobbdbbto.',
  '.hDoddddo..',
  '....FF.oFFk',
];
const CLIMB_B = [
  '...........',
  '...oooo....',
  '..oDbbBo...',
  '..obbBBio..',
  '.obbbbbetn.',
  '.obbbbrtto.',
  '..obBbbwwFk',
  '..obBbbbbbk',
  '.Dobbdbbto.',
  '.hDoddddoFk',
  '....FF.....',
];
const up1 = (r: readonly string[]) => [...r.slice(1), '.'.repeat(r[0].length)];
export const CLIMB: FrameDef[] = [f(CLIMB_A, 5, 10), f(up1(CLIMB_A), 5, 10), f(CLIMB_B, 5, 10), f(up1(CLIMB_B), 5, 10)];

// Pulling over the ledge; anchor = feet on the ledge top.
export const HOIST: FrameDef[] = [
  f([
    '...oooo...',
    '..oDbbBo..',
    '..obbBBio.',
    '.obbbbbetn',
    '.obbbbrtto',
    '.obbbbbwFk',
    '.obBbbbo..',
    'Dodbbbo...',
    'hDoddo....',
    '...FF.....',
  ], 4, 4),
  f([
    '....oooo...',
    '...oDbbBo..',
    '...obbBBio.',
    '..obbbbbetn',
    '.obbbbbrtto',
    'obBbbbbbwFk',
    'obbbbdbbo..',
    'Doddddo....',
    'hFF........',
  ], 4, 6),
  f([
    '....oooo...',
    '...oDbbBo..',
    '..oobbBBio.',
    '.obbbbbbetn',
    'obBbbbbrtto',
    'obbbbbbbww.',
    'Dobbbdbbo..',
    'hDoddddFFk.',
  ], 4, 7),
  walk(1, ['...d...d...', '..FF...FFk.']),
];

// Upright on haunches, paws at chest, round belly.
const SENTRY_A = [
  '...ooooo...',
  '..oDbBbDo..',
  '..obibibo..',
  '..orebero..',
  '..obtntbo..',
  '...otwto...',
  '..obtctbo..',
  '.obbFtFbbo.',
  '.obbktkbbo.',
  'obbbtttbbbo',
  'obhbtTtbhbo',
  '.oFFoooFFo.',
];
export const SENTRY: FrameDef[] = [
  f(SENTRY_A),
  // paws twitch outward
  f(put(SENTRY_A, [[4, 7, 't'], [6, 7, 't'], [3, 7, 'F'], [7, 7, 'F'], [4, 8, 't'], [6, 8, 't'], [3, 8, 'k'], [7, 8, 'k']])),
  // blink
  f(put(SENTRY_A, [[4, 2, 'b'], [6, 2, 'b'], [4, 3, 'o'], [6, 3, 'o']])),
];

// Holding a plank, then setting it down in front.
export const PLANK: FrameDef[] = [
  f([
    '...oooo.....',
    '..oDbbBo....',
    '..obbBBio...',
    '.obbbbbetn..',
    '.obbbbrtto..',
    'obBbbbbww...',
    'obBbbbpPpppp',
    'obbbbbbFk...',
    'Dodddddo....',
    'hFF...FFk...',
  ], 4, 9),
  f([
    '............',
    '...oooo.....',
    '..oDbbBo....',
    '..obbBBio...',
    '.obbbbbetn..',
    '.obbbbrtto..',
    'obBbbbbwwk..',
    'obBbbbpPpppp',
    'DodddddoFk..',
    'hFF...FFk...',
  ], 4, 9),
  f([
    '............',
    '............',
    '....oooo....',
    '...oDbbBo...',
    '..oobbBBio..',
    '.obbbbbbetn.',
    'obBbbbbrtto.',
    'obbbbbbbwwFk',
    'DoddddddpPpppp',
    'hFF...FF....',
  ], 4, 9),
  f([
    '............',
    '............',
    '....oooo....',
    '...oDbbBo...',
    '..oobbBBio..',
    '.obbbbbbetn.',
    'obBbbbbrtto.',
    'obbbbbbbww..',
    'DoddddddoFkk',
    'hFF...FF....',
  ], 4, 9),
];

export const SHRUG: FrameDef[] = [
  f([...FACE, '.obtctbo.', 'obbtttbbo', 'kbbtttbbk', '.obbTbbo.', FEET_F], 4, 10),
  f([
    '...ooooo...',
    '..oDbBbDo..',
    '..obibibo..',
    '..orebero..',
    '..obtntbo..',
    'k..otwto..k',
    'Fo.obtbo.oF',
    '.bbbtctbbb.',
    '..obtttbo..',
    '..obbTbbo..',
    '..FkF.FkF..',
  ], 5, 10),
  f([
    '...........',
    'k.........k',
    'Fo.ooooo.oF',
    '.boDbBbDob.',
    '..obibibo..',
    '..orebero..',
    '..obtntbo..',
    '...ottto...',
    '..obtctbo..',
    '..obbTbbo..',
    '..FkF.FkF..',
  ], 5, 10),
];

// Low crouch clawing ahead.
const TUN = [
  '....oooo...',
  '...oDbbBo..',
  '..oobbBBio.',
  '.obbbbbbetn',
  'obBbbbbrtto',
  'obbbbbbbww.',
  'Dobbbdbbo..',
  'hDoddddFo..',
];
const withClaws = (rows: readonly string[], pts: [number, number][]): string[] => put(rows, pts.map(([x, y]) => [x, y, 'k']));
export const TUNNEL: FrameDef[] = [
  f(withClaws(TUN, [[10, 5], [10, 6]]), 4, 7),
  f(withClaws(TUN, [[9, 6], [10, 6], [9, 7]]), 4, 7),
  f(withClaws(TUN, [[10, 7], [9, 7]]), 4, 7),
  f(withClaws(TUN, [[10, 2], [10, 5]]), 4, 7),
];

// Front view hunched, paws scrabbling at the feet.
const BUR = [
  '..ooooo..',
  '.oDbBbDo.',
  '.obibibo.',
  '.orebero.',
  'obbtntbbo',
  'obbbwbbbo',
  'obbtctbbo',
  'obbtttbbo',
];
const B1 = '.........';
export const BURROW: FrameDef[] = [
  f([B1, ...BUR, '.Fk...kF.', '.k.....k.']),
  f([B1, B1, ...BUR.slice(0, 7), '.obFoFbo.', '..k...k..']),
  f([B1, ...BUR, '.FkbobkF.', '..k...k..']),
  f([B1, B1, ...BUR.slice(0, 7), 'oF.....Fo', 'k.......k']),
];

// Diagonal swing: paws overhead -> down-forward.
const SCR_BODY = [
  '..oDbbBo...',
  '..obbBBio..',
  '.obbbbbetn.',
  '.obbbbrtto.',
  'obBbbbbww..',
  'obBbbbcto..',
  'Dodddddo...',
  'hFF...FFk..',
];
export const SCRAPE: FrameDef[] = [
  f(['...kk......', '....Fo.....', '...oboo....', ...SCR_BODY], 4, 10),
  f(['........kk.', '.......oF..', '...ooooob..', ...SCR_BODY], 4, 10),
  f([
    '...........',
    '...........',
    '...oooo....',
    '..oDbbBo...',
    '..obbBBio..',
    '.obbbbbetn.',
    '.obbbbrttok',
    'obBbbbbwwFk',
    'obBbbbbbo..',
    'Dodddddo...',
    'hFF...FFk..',
  ], 4, 10),
  f([
    '...........',
    '...........',
    '...........',
    '....oooo...',
    '...oDbbBo..',
    '..oobbBBio.',
    '.obbbbbbetn',
    'obBbbbbrtto',
    'obbbbbbbwwo',
    'DodddddoFFk',
    'hFF...FF.kk',
  ], 4, 10),
];

export const SPLAT: FrameDef[] = [
  f([
    '..ooooooo..',
    '.obDebeDbo.',
    'obbrtntrbbo',
    'obbttcttbbo',
    '.FoooooooF.',
  ], 5, 4),
  f([
    '.ooooooooooo.',
    'obbbxbtbxbbbo',
    'kFbbbtttbbbFk',
  ], 6, 2),
];

// Facing the viewer, one paw waving.
const WAVE_BODY = ['.obtctbo...', 'obbtttbbo..', 'obbtttbbo..', '.obbTbbo...', '.FkF.FkF...'];
export const WAVE: FrameDef[] = [
  f([
    '.........k.',
    '..ooooo.oF.',
    '.oDbBbDoob.',
    '.obibibob..',
    '.oreberob..',
    '.obtntbob..',
    '..otwtob...',
    ...WAVE_BODY,
  ], 4, 11),
  f([
    '...........',
    '..ooooo..k.',
    '.oDbBbDo.Fo',
    '.obibibo.bo',
    '.orebero.bo',
    '.obtntbobo.',
    '..otwtobb..',
    ...WAVE_BODY,
  ], 4, 11),
];

// ---------- bouncer: pulls a sprout from behind, crouches, pats it in ----------
const CROUCH = [...FACE, 'obbtctbbo', 'obbtttbbo', 'obbTTTbbo', 'FkF...FkF'];
export const PLANT: FrameDef[] = [
  // ta-da: sprout held overhead
  f([
    '...qqq...',
    '..qsqqq..',
    '..FQsQF..',
    '..obsbo..',
    '.obooobo.',
    FACE[1], FACE[2], FACE[3], FACE[4],
    '..otnto..',
    '.obtctbo.',
    'obbtttbbo',
    '.obbTbbo.',
    FEET_F,
  ]),
  // set it down between the feet
  f(put(CROUCH, [[2, 8, 'F'], [6, 8, 'F'], [3, 8, 'k'], [5, 8, 'k'], [4, 8, 'o']])),
  // paws up
  f(put(CROUCH, [[1, 5, 'F'], [7, 5, 'F'], [1, 4, 'k'], [7, 4, 'k']])),
  // pat
  f(put(CROUCH, [[3, 6, 'F'], [5, 6, 'F'], [4, 6, 'c'], [3, 7, 'k'], [5, 7, 'k']])),
];

// ---------- launched off a pad: arms up rising, spread-eagle falling ----------
const LFACE = [FACE[0], FACE[1], FACE[2], FACE[3], FACE[4], '..otnto..', '.obtctbo.', '.obtttbo.', '..obTbo..'];
export const LAUNCH_UP: FrameDef[] = [
  f(['k.......k', 'Fb.....bF', '.bo...ob.', ...LFACE, '...FoF...', '...k.k...']),
  f(['.k.....k.', '.Fb...bF.', '..bo.ob..', ...LFACE, '..Fo.oF..', '..k...k..']),
];
const SPREAD = [
  '...obtntbo...',
  '....otnto....',
  '...obtctbo...',
  '...obtttbo...',
  '...obbTbbo...',
];
export const LAUNCH_DOWN: FrameDef[] = [
  f([
    '....ooooo....',
    '...oDbBbDo...',
    'kF.obibibo.Fk',
    '.bboreberobb.',
    ...SPREAD,
    '..Fo.....oF..',
    '.Fk.......kF.',
  ]),
  f([
    '....ooooo....',
    'k..oDbBbDo..k',
    'Fb.obibibo.bF',
    '.bboreberobb.',
    ...SPREAD,
    '...Fo...oF...',
    '..Fk.....kF..',
  ]),
];

// ---------- napper: yawn, lie down, curl into a ball ----------
const SLEEPY = [FACE[0], FACE[1], '.obBbBbo.', '.oroboro.', FACE[4]];
export const NAP_YAWN: FrameDef[] = [
  f([...SLEEPY, '..otnto..', '.obtctbo.', 'obbtttbbo', 'obbtttbbo', '.obbTbbo.', FEET_F]),
  f([
    'k.......k',
    'Fb.....bF',
    'ob.ooo.bo',
    ...SLEEPY.slice(1),
    '..onnno..',
    '...ono...',
    '.obtctbo.',
    'obbtttbbo',
    '.obbTbbo.',
    FEET_F,
  ]),
];
export const NAP_LIE: FrameDef = f([
  '....oooo...',
  '...oDbbBo..',
  '..oobbBBBo.',
  '.obbbbbbotn',
  'obBbbbbrtto',
  'obbbbdbbtto',
  'Dobbbbbbbo.',
  'hDoFFoooFFk',
], 5, 7);
const BALL = [
  '...ooooo...',
  '..obbBBBo..',
  '.obbbbbBDo.',
  'obhbbbbbbbo',
  'obbbbbbbobo',
  'obbdbbbrttn',
  'oDDDDDhhhto',
  '.ooooooooo.',
];
export const NAP_BALL: FrameDef[] = [
  f(BALL, 5, 7),
  f(['...........', '..ooooooo..', '.obbbBBBDo.', ...BALL.slice(3)], 5, 7),
];
