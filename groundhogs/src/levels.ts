import { VIEW_H } from './types';
import type { LevelDef, Shape, ShapeMat } from './types';

// ---------- shape builders ----------
const rect = (x: number, y: number, w: number, h: number, mat?: ShapeMat): Shape =>
  mat ? { kind: 'rect', x, y, w, h, mat } : { kind: 'rect', x, y, w, h };
const rock = (x: number, y: number, w: number, h: number): Shape => rect(x, y, w, h, 'rock');
const hole = (x: number, y: number, w: number, h: number): Shape => ({ kind: 'rect', x, y, w, h, erase: true });
const ellipse = (cx: number, cy: number, rx: number, ry: number, mat?: ShapeMat): Shape =>
  mat ? { kind: 'ellipse', cx, cy, rx, ry, mat } : { kind: 'ellipse', cx, cy, rx, ry };
const poly = (points: [number, number][], mat?: ShapeMat): Shape =>
  mat ? { kind: 'poly', points, mat } : { kind: 'poly', points };
// whole-world dirt fill (burrow theme), then carve with hole()
const fill = (w: number): Shape => rect(0, 0, w, VIEW_H);
// steep mound: vertical sides `wall` px tall (unwalkable) topped by a rounded cap
const mound = (cx: number, baseY: number, rx: number, capH: number, wall: number, mat?: ShapeMat): Shape[] => [
  rect(cx - rx, baseY - wall, rx * 2, wall, mat),
  ellipse(cx, baseY - wall, rx, capH, mat),
];
// low walkable hump (max slope well under the 6px step-up)
const bump = (cx: number, baseY: number, rx: number, h: number): Shape => ellipse(cx, baseY, rx, h);
// hanging triangle from a ceiling
const stalactite = (x: number, ceilY: number, w: number, len: number): Shape =>
  poly([[x, ceilY], [x + w / 2, ceilY + len], [x + w, ceilY]]);

// Conventions: a rect top at y=Y means groundhog feet rest at Y-1.
export const LEVELS: LevelDef[] = [
  // 1. Burrow anywhere on the walled shelf (30px thick); they drop 30px to the floor and walk right.
  {
    id: 'first-thaw',
    name: 'First Thaw',
    hint: 'The ground is soft after the thaw. Dig straight down!',
    width: 640,
    theme: 'meadow',
    shapes: [
      rect(0, 200, 640, 40),
      rect(0, 120, 12, 80),
      rect(628, 120, 12, 80),
      rect(60, 140, 300, 30),
      rect(60, 104, 10, 36),
      rect(350, 104, 10, 36),
      bump(470, 200, 40, 5),
    ],
    entrances: [{ x: 210, y: 110 }],
    exits: [{ x: 570, y: 199 }],
    hazards: [],
    count: 20,
    required: 10,
    releaseRate: 50,
    timeLimit: 240,
    skills: { burrower: 10 },
  },

  // 2. Every groundhog needs a glider before stepping off the 130px cliff.
  {
    id: 'six-more-weeks',
    name: 'Six More Weeks',
    hint: 'A long way down. Hand out leaves before they step off the edge.',
    width: 560,
    theme: 'winter',
    shapes: [
      poly([[0, 70], [240, 70], [250, 80], [250, 240], [0, 240]]),
      rect(0, 30, 10, 40),
      rect(250, 200, 310, 40),
      rect(548, 140, 12, 60),
      bump(400, 200, 30, 5),
    ],
    entrances: [{ x: 70, y: 40 }],
    exits: [{ x: 480, y: 199 }],
    hazards: [],
    count: 15,
    required: 10,
    releaseRate: 40,
    timeLimit: 180,
    skills: { glider: 15 },
  },

  // 3. Tunnel right through two 40px earth walls at floor level.
  {
    id: 'root-cellar',
    name: 'Root Cellar',
    hint: 'Three cellars, two walls of packed earth. Dig sideways.',
    width: 800,
    theme: 'burrow',
    shapes: [
      fill(800),
      hole(16, 90, 264, 110),
      hole(320, 90, 200, 110),
      hole(560, 90, 224, 110),
      rock(0, 0, 8, 240),
      rock(792, 0, 8, 240),
      stalactite(140, 90, 20, 22),
      stalactite(400, 90, 16, 30),
      stalactite(640, 90, 24, 18),
      bump(420, 200, 25, 4),
    ],
    entrances: [{ x: 90, y: 170 }],
    exits: [{ x: 700, y: 199 }],
    hazards: [],
    count: 20,
    required: 14,
    releaseRate: 50,
    timeLimit: 240,
    skills: { tunneler: 8 },
  },

  // 4. Ditch (20 deep, harmless trap): plank out from inside it, start ~4-20px from its left wall.
  //    Water gap (16 wide): plank starting 1-22px before the edge; or chain two from further back.
  {
    id: 'clover-bridge',
    name: 'Clover Bridge',
    hint: 'Build a ramp of planks to climb out of the ditch and cross the stream.',
    width: 760,
    theme: 'meadow',
    shapes: [
      rect(0, 180, 140, 60),
      rect(140, 200, 40, 40),
      rect(180, 180, 220, 60),
      rect(416, 180, 344, 60),
      rect(0, 120, 10, 60),
      rect(750, 120, 10, 60),
      bump(290, 180, 30, 4),
    ],
    entrances: [{ x: 60, y: 150 }],
    exits: [{ x: 690, y: 179 }],
    hazards: [{ kind: 'water', x: 400, y: 216, w: 16, h: 24 }],
    count: 20,
    required: 12,
    releaseRate: 20,
    timeLimit: 240,
    skills: { planker: 8 },
  },

  // 5. Climbers scale the 52px rock pillar (safe 52px drop after), then the 90px cliff to the exit.
  {
    id: 'shadow-check',
    name: 'Shadow Check',
    hint: 'Walls are no trouble for a groundhog with good claws.',
    width: 720,
    theme: 'dusk',
    shapes: [
      rect(0, 200, 720, 40),
      rect(0, 100, 10, 100),
      rock(230, 148, 24, 52),
      rect(460, 110, 260, 90),
      rect(710, 70, 10, 40),
      bump(360, 200, 40, 4),
    ],
    entrances: [{ x: 100, y: 170 }],
    exits: [{ x: 650, y: 109 }],
    hazards: [],
    count: 10,
    required: 8,
    releaseRate: 30,
    timeLimit: 180,
    skills: { climber: 10 },
  },

  // 6. Sentry the lead on the rock before the dirt patch (x 345-371) to hold the crowd. Pop the sentry,
  //    then the first walker into the patch scrapes right (x 372-386) and cuts out the 70px cliff face.
  {
    id: 'hold-the-line',
    name: 'Hold the Line',
    hint: 'Stand someone up to hold the crowd. Pop them to let it go, then dig down at an angle.',
    width: 640,
    theme: 'meadow',
    shapes: [
      rock(0, 120, 372, 120),
      rect(372, 120, 28, 80),
      rock(372, 200, 28, 40),
      rock(0, 80, 10, 40),
      rect(400, 190, 240, 50),
      rect(628, 130, 12, 60),
    ],
    entrances: [{ x: 300, y: 90 }],
    exits: [{ x: 580, y: 189 }],
    hazards: [],
    count: 30,
    required: 24,
    releaseRate: 40,
    timeLimit: 240,
    skills: { sentry: 2, popper: 2, scraper: 3 },
  },

  // 7. Burrow through the dirt patch (x 260-379) in the 20px rock floor; the crowd drops 60px through
  //    the shaft (safe); tunnel the 60px wall right.
  {
    id: 'burrow-down',
    name: 'Burrow Down',
    hint: 'Rock will not budge. Find the soft spot.',
    width: 800,
    theme: 'burrow',
    shapes: [
      fill(800),
      hole(20, 30, 400, 60),
      rock(20, 90, 400, 20),
      rect(260, 90, 120, 20),
      rock(420, 20, 40, 90),
      hole(20, 110, 500, 40),
      hole(580, 100, 200, 50),
      rock(0, 200, 800, 40),
      rock(0, 0, 12, 240),
      rock(788, 0, 12, 240),
      stalactite(560, 30, 18, 26),
      stalactite(160, 110, 20, 14),
    ],
    entrances: [{ x: 80, y: 60 }],
    exits: [{ x: 700, y: 149 }],
    hazards: [],
    count: 50,
    required: 40,
    releaseRate: 50,
    timeLimit: 240,
    skills: { burrower: 3, tunneler: 3 },
  },

  // 8. Tunnel the snow mound; plank the 20px gap (start 2-18px before edge); plank onto the 20px rock
  //    step (start 20-36px before it); drop 40px; tunnel the snowbank.
  {
    id: 'long-winter',
    name: 'Long Winter',
    hint: 'A long trek through the snow. Pace your planks.',
    width: 1200,
    theme: 'winter',
    shapes: [
      rect(0, 180, 420, 60),
      rect(0, 120, 10, 60),
      ...mound(260, 180, 50, 30, 12),
      rect(440, 180, 160, 60),
      rect(440, 172, 3, 8, 'rock'),
      rock(600, 160, 300, 80),
      rect(900, 200, 300, 40),
      rect(1000, 150, 40, 50),
      ellipse(1020, 150, 20, 10),
      rect(1188, 140, 12, 60),
      bump(520, 180, 30, 3),
      bump(950, 200, 40, 4),
    ],
    entrances: [{ x: 80, y: 150 }],
    exits: [{ x: 1120, y: 199 }],
    hazards: [{ kind: 'water', x: 420, y: 214, w: 20, h: 26 }],
    count: 40,
    required: 28,
    releaseRate: 30,
    timeLimit: 300,
    skills: { tunneler: 3, planker: 4 },
  },

  // 9. Two entrances. Left: burrow the 40px plateau anywhere (60px drop through the shaft). Right: scraper
  //    heading left from x 672-699 (dirt buttress) cuts out of the cliff face. Exit in the middle valley.
  {
    id: 'twin-hollows',
    name: 'Twin Hollows',
    hint: 'Two families, two problems. Rock does not dig.',
    width: 960,
    theme: 'dusk',
    shapes: [
      rect(0, 200, 600, 40),
      rock(600, 200, 360, 40),
      rect(0, 40, 10, 160),
      rect(10, 140, 310, 40),
      rock(700, 110, 250, 90),
      rect(620, 110, 80, 90),
      rock(950, 40, 10, 160),
      poly([[372, 200], [410, 192], [448, 200]]),
    ],
    entrances: [
      { x: 100, y: 110 },
      { x: 860, y: 80 },
    ],
    exits: [{ x: 480, y: 199 }],
    hazards: [],
    count: 80,
    required: 64,
    releaseRate: 40,
    timeLimit: 300,
    skills: { burrower: 2, scraper: 3, sentry: 1, popper: 1 },
  },

  // 10. Sentry the first left-walker (x~170-200). Chain plankers heading right until the ramp meets the
  //     48px rock block: 2 from x 285-297, or 3 from x 250-288; everyone else loops safely meanwhile.
  {
    id: 'groundhog-day',
    name: 'Groundhog Day',
    hint: 'Same island, same wall, again and again... until you build a way up.',
    width: 640,
    theme: 'meadow',
    shapes: [
      rect(160, 200, 320, 40),
      rock(360, 152, 120, 48),
      rect(0, 228, 160, 12),
      rect(480, 228, 160, 12),
      bump(230, 200, 30, 3),
    ],
    entrances: [{ x: 230, y: 170 }],
    exits: [{ x: 440, y: 151 }],
    hazards: [
      { kind: 'water', x: 0, y: 210, w: 160, h: 18 },
      { kind: 'water', x: 480, y: 210, w: 160, h: 18 },
    ],
    count: 25,
    required: 20,
    releaseRate: 35,
    timeLimit: 240,
    skills: { sentry: 1, planker: 3, popper: 1 },
  },

  // 11. Crowd is penned. One climber (heading right) scales the pen wall (56px drop), chains 2 plankers over
  //     the thorn pit from x 380-399, then tunnels the thorn-topped hedge from x 546-559 (do not let it
  //     climb!). Then tunnel the pen wall (x 186-199).
  {
    id: 'thornbrake',
    name: 'Thornbrake',
    hint: 'Keep the family safe at home while one brave scout clears the way.',
    width: 1000,
    theme: 'dusk',
    shapes: [
      rock(0, 200, 1000, 40),
      rock(0, 20, 40, 140),
      rock(0, 20, 52, 6),
      rock(0, 160, 216, 40),
      rect(200, 104, 16, 56),
      rect(216, 160, 184, 40),
      rock(400, 190, 52, 10),
      rect(452, 160, 208, 40),
      rect(452, 152, 3, 8, 'rock'),
      rect(560, 104, 40, 56),
      ellipse(580, 104, 20, 4),
      rect(660, 190, 340, 10),
      rect(988, 130, 12, 60),
      bump(300, 160, 30, 3),
    ],
    entrances: [{ x: 110, y: 130 }],
    exits: [{ x: 900, y: 189 }],
    hazards: [
      { kind: 'thorns', x: 400, y: 176, w: 52, h: 14 },
      { kind: 'thorns', x: 560, y: 92, w: 40, h: 12 },
    ],
    count: 30,
    required: 27,
    releaseRate: 30,
    timeLimit: 300,
    skills: { climber: 1, planker: 3, tunneler: 2 },
  },

  // 12. Burrow the soft end of the shelf (x 236-318; 60px drop). One climber+glider crosses the ice wall,
  //     planks gap 1 (from x 677-699) and gap 2 (from x 734-755), scrapes under the rock wall into the den
  //     (from x 895-949). Then tunnel the dirt crack at the ice wall's base (x 506-519) for the crowd.
  {
    id: 'early-spring',
    name: 'Early Spring',
    hint: 'One last frozen valley between the family and spring.',
    width: 1320,
    theme: 'winter',
    shapes: [
      rock(0, 224, 1320, 16),
      rect(0, 172, 700, 52),
      rect(0, 112, 320, 30),
      rock(0, 132, 236, 10),
      rect(0, 72, 10, 40),
      rect(0, 142, 10, 30),
      rock(520, 92, 40, 68),
      poly([[520, 92], [530, 80], [540, 92], [550, 84], [560, 92]], 'rock'),
      rect(520, 160, 40, 12),
      rock(716, 172, 40, 52),
      rect(772, 172, 548, 52),
      rect(772, 164, 3, 8, 'rock'),
      rock(1000, 92, 30, 94),
      rock(990, 92, 50, 6),
      hole(1000, 196, 300, 28),
      bump(420, 172, 40, 4),
      bump(830, 172, 30, 4),
    ],
    entrances: [{ x: 90, y: 82 }],
    exits: [{ x: 1240, y: 223 }],
    hazards: [
      { kind: 'water', x: 700, y: 200, w: 16, h: 24 },
      { kind: 'water', x: 756, y: 200, w: 16, h: 24 },
    ],
    count: 40,
    required: 34,
    releaseRate: 40,
    timeLimit: 360,
    skills: { burrower: 1, climber: 1, glider: 1, planker: 3, scraper: 2, tunneler: 1 },
  },
];
