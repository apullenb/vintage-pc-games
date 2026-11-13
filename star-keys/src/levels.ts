// Curriculum + world layouts: 12 worlds, each adding a few keys (QWERTY touch typing).
import { VIEW_W, type LevelDef, type MoveKind, type PlatformKind, type Waypoint } from './types.ts';

export type Finger = 'L5' | 'L4' | 'L3' | 'L2' | 'R2' | 'R3' | 'R4' | 'R5' | 'thumb';

// Home-position finger per key (5 = pinky, 2 = index). Capitals use the lowercase key.
export const FINGERS: Record<string, Finger> = {
  ...fingerRow('L5', "1qaz`!"),
  ...fingerRow('L4', '2wsx'),
  ...fingerRow('L3', '3edc'),
  ...fingerRow('L2', '45rtfgvb'),
  ...fingerRow('R2', '67yuhjnm'),
  ...fingerRow('R3', '8ik,'),
  ...fingerRow('R4', '9ol.'),
  ...fingerRow('R5', "0p;/'-=[]?"),
  ' ': 'thumb',
};

function fingerRow(f: Finger, chars: string): Record<string, Finger> {
  const out: Record<string, Finger> = {};
  for (const c of chars) out[c] = f;
  return out;
}

/** Finger for any prompt char (uppercase maps via its lowercase key). */
export function fingerFor(ch: string): Finger | undefined {
  return FINGERS[ch] ?? FINGERS[ch.toLowerCase()];
}

// ---------- path builder ----------
// [move into this waypoint, dx, dy, platform?, platformW?]
type Seg = [MoveKind, number, number, PlatformKind?, number?];

function build(x: number, y: number, base: PlatformKind, segs: Seg[]): Waypoint[] {
  const out: Waypoint[] = [{ x, y, move: 'run', platform: base, platformW: 48 }];
  for (const [move, dx, dy, plat, w] of segs) {
    x += dx;
    y += dy;
    const platform = plat ?? (move === 'float' ? 'none' : base);
    const platformW = w ?? (platform === 'none' ? undefined : move === 'run' ? 48 : 28);
    out.push(platformW === undefined ? { x, y, move, platform } : { x, y, move, platform, platformW });
  }
  return out;
}

const worldWidth = (p: Waypoint[]) => Math.max(VIEW_W, p[p.length - 1].x + 60);

// ---------- keys ----------
const LOWER = 'abcdefghijklmnopqrstuvwxyz';
const UPPER = LOWER.toUpperCase();
const K1 = 'fjdk';
const K2 = K1 + 'sla;';
const K3 = K2 + 'ei';
const K4 = K3 + 'ru';
const K5 = K4 + 'ghty';
const K6 = K5 + 'ow';
const K7 = K6 + 'cmvn';
const K8 = K7 + 'bpxzq';
const K9 = LOWER + ";" + UPPER + ",./'";
const K10 = K9 + '1234567890-';
const K11 = K10 + ' ';
const K12 = K11 + '!?';

// ---------- worlds ----------
const P1 = build(40, 224, 'metal', [
  ['run', 50, 0], ['run', 50, 0], ['climb', 0, -56, 'metal', 32], ['run', 50, 0],
  ['jump', 60, -24], ['run', 50, 0], ['jump', 64, 32], ['run', 46, 0],
  ['jump', 60, 44], ['run', 60, 0, 'metal', 64],
]);

const P2 = build(40, 214, 'rock', [
  ['run', 50, 0], ['jump', 60, -30], ['run', 44, 0], ['jump', 56, -30],
  ['jump', 66, 36], ['run', 48, 0], ['jet', 84, -10], ['jump', 54, -36],
  ['run', 46, 0], ['jump', 60, 60], ['run', 60, 0, 'rock', 64],
]);

const P3 = build(40, 206, 'rock', [
  ['jump', 56, -30], ['float', 50, -36, 'rock', 20], ['jump', 60, 20], ['run', 40, 0],
  ['float', 52, -40, 'rock', 20], ['float', 56, 24, 'rock', 20], ['jump', 60, 30], ['run', 40, 0],
  ['jet', 80, -40], ['jump', 56, 40], ['jump', 60, 36], ['run', 56, 0, 'rock', 64],
]);

const P4 = build(40, 220, 'rock', [
  ['run', 50, 0], ['climb', 0, -50, 'rock', 32], ['run', 50, 0], ['jump', 56, -26],
  ['run', 46, 0], ['jet', 86, 0], ['run', 40, 0], ['jump', 56, 36],
  ['jump', 60, 40], ['run', 50, 0], ['jump', 54, -30], ['run', 56, 0, 'rock', 64],
]);

const P5 = build(40, 212, 'ice', [
  ['run', 52, 0], ['jump', 56, -28], ['run', 50, 0], ['jump', 60, 32],
  ['run', 50, 0], ['jet', 84, -30], ['run', 44, 0], ['climb', 0, -50, 'ice', 32],
  ['run', 50, 0], ['jump', 60, 26], ['jump', 56, -24], ['jet', 80, 40],
  ['jump', 54, 36], ['run', 56, 0, 'ice', 64],
]);

const P6 = build(40, 218, 'moss', [
  ['run', 48, 0], ['jump', 56, -32], ['climb', 0, -48, 'moss', 32], ['run', 50, 0],
  ['jump', 60, -24], ['run', 44, 0], ['jump', 60, 36], ['run', 48, 0],
  ['jump', 56, 40], ['jet', 86, -10], ['run', 46, 0], ['jump', 56, -30],
  ['jump', 60, 50], ['run', 56, 0, 'moss', 64],
]);

const P7 = build(40, 220, 'metal', [
  ['run', 50, 0], ['climb', 0, -48, 'metal', 32], ['run', 50, 0], ['run', 46, 0],
  ['float', 56, -36], ['float', 54, -24], ['float', 56, 30], ['float', 50, 24, 'metal', 40],
  ['run', 46, 0], ['climb', 0, -50, 'metal', 32], ['run', 50, 0], ['jump', 60, 30],
  ['run', 44, 0], ['jet', 84, -20], ['jump', 58, 60], ['run', 56, 0, 'metal', 64],
]);

const P8 = build(40, 200, 'metal', [
  ['run', 46, 0], ['jet', 76, -40], ['run', 40, 0], ['jump', 60, 30],
  ['jet', 76, -40], ['float', 54, -30], ['float', 56, 34], ['jump', 60, 30],
  ['run', 44, 0], ['jet', 84, -30], ['run', 40, 0], ['jump', 56, -32],
  ['float', 60, 30], ['jump', 58, 36], ['run', 46, 0], ['run', 54, 0, 'metal', 64],
]);

const P9 = build(40, 224, 'metal', [
  ['run', 50, 0], ['jump', 56, -30], ['climb', 0, -52, 'metal', 32], ['run', 50, 0],
  ['run', 46, 0], ['jump', 60, 30], ['jump', 56, -28], ['run', 46, 0],
  ['climb', 0, -48, 'metal', 32], ['run', 50, 0], ['jump', 60, 36], ['jump', 56, 40],
  ['run', 46, 0], ['jet', 84, -20], ['jump', 60, 64], ['run', 56, 0, 'metal', 64],
]);

const P10 = build(40, 210, 'ice', [
  ['run', 50, 0], ['jump', 56, -30, 'rock'], ['jump', 60, 30], ['run', 46, 0],
  ['jet', 84, -26], ['run', 44, 0], ['jump', 56, -34, 'rock'], ['jump', 60, -24],
  ['run', 46, 0], ['jump', 60, 40, 'rock'], ['jet', 84, 10], ['run', 44, 0],
  ['jump', 56, -36], ['float', 56, -30], ['float', 60, 36], ['jump', 56, 36, 'rock'],
  ['run', 46, 0], ['run', 56, 0, 'ice', 64],
]);

const P11 = build(40, 200, 'crystal', [
  ['run', 46, 0], ['jump', 56, -30], ['float', 56, -36], ['float', 58, 20],
  ['jump', 56, 24], ['jet', 84, -30], ['float', 56, -36], ['float', 58, 28],
  ['float', 56, -28], ['jump', 60, 40], ['run', 44, 0], ['jet', 84, 24],
  ['jump', 56, -34], ['float', 58, -30], ['float', 56, 40], ['jump', 58, 36],
  ['run', 46, 0], ['run', 56, 0, 'crystal', 64],
]);

const P12 = build(40, 216, 'rock', [
  ['run', 48, 0], ['jump', 56, -30], ['jump', 60, -28, 'crystal'], ['jet', 84, 20],
  ['run', 44, 0], ['climb', 0, -50, 'rock', 32], ['run', 48, 0, 'crystal'], ['jump', 58, -28],
  ['jump', 60, 36, 'crystal'], ['jet', 84, -10], ['float', 56, -30], ['float', 58, 34],
  ['jump', 56, 36], ['jet', 84, 30], ['jump', 56, -20, 'crystal'], ['run', 56, 0, 'rock', 64],
]);

// ---------- prompt pools ----------
const W1 = [
  'fj', 'jf', 'dk', 'kd', 'ff', 'jj', 'dd', 'kk', 'fjf', 'jfj', 'dkd', 'kdk',
  'fdk', 'jkd', 'dfj', 'kjf', 'ffj', 'jjf', 'ddk', 'kkd', 'fjj', 'jff', 'dkk', 'kdd',
  'fjdk', 'dkfj', 'jjff', 'kkdd', 'fdfd', 'jkjk', 'fkdj', 'djfk', 'kfjd', 'dfjk',
];

const W2 = [
  'add', 'ads', 'all', 'ask', 'asks', 'dad', 'dads', 'fad', 'fads', 'fall', 'falls',
  'lad', 'lads', 'lass', 'sad', 'salad', 'flask', 'alas', 'sass', 'jak', 'kas',
  'asdf', 'jkl;', 'fdsa', ';lkj', 'sal', 'fla', 'dsa', 'jas', 'kal', 'la;', 'as;',
  'ask;', 'dad;', 'all;', 'sad;', 'alfalfa',
];

const W3 = [
  'sea', 'see', 'fee', 'kid', 'lid', 'did', 'aid', 'idle', 'side', 'slide', 'field',
  'keel', 'kale', 'leaf', 'deal', 'seal', 'sled', 'fled', 'feel', 'said', 'skies',
  'file', 'like', 'lake', 'safe', 'jade', 'sail', 'ease', 'else', 'self', 'life',
  'ski', 'skis', 'desk', 'disk', 'eel', 'idea', 'ideas', 'feed', 'seed', 'seek',
  'leak', 'skill', 'fill', 'dial', 'ideal', 'ladies',
];

const W4 = [
  'red', 'rid', 'ride', 'far', 'jar', 'ear', 'air', 'fire', 'rise', 'use', 'sure',
  'rule', 'ruler', 'lure', 'radar', 'fuel', 'dusk', 'dark', 'real', 'dare', 'rider',
  'laser', 'lasers', 'read', 'raid', 'surf', 'rake', 'fur', 'safari', 'user', 'jars',
  'rides', 'aura', 'furs', 'afraid', 'ideal', 'slider', 'skier', 'drill', 'dear',
  'rural', 'rakes', 'reef', 'sir', 'lurk',
];

const W5 = [
  'sky', 'stay', 'star', 'stars', 'dust', 'rust', 'earth', 'eight', 'light', 'tight',
  'high', 'flight', 'jet', 'jets', 'rays', 'shift', 'gift', 'kite', 'hike', 'glide',
  'guide', 'hush', 'yet', 'that', 'this', 'they', 'tidy', 'daily', 'tray', 'height',
  'huge', 'truly', 'shuttle', 'tilt', 'trail', 'sight', 'skate', 'shy', 'stray',
  'dusty', 'gas', 'the', 'stardust', 'starlight', 'gate', 'heat', 'thrust',
];

const W6 = [
  'slow', 'glow', 'grow', 'flow', 'world', 'words', 'two', 'owl', 'howl', 'yellow',
  'wolf', 'flower', 'word', 'work', 'hook', 'look', 'slowly', 'wild', 'low', 'row',
  'dew', 'dog', 'frog', 'goes', 'toward', 'follow', 'hollow', 'shadow', 'radio',
  'outer', 'wiggle', 'foggy', 'jolly', 'throw', 'show', 'tower', 'frost', 'gold',
  'jewel', 'otter', 'sloth', 'gorilla', 'wildlife', 'whoosh', 'swirl', 'flowers',
];

const W7 = [
  'comet', 'moon', 'moons', 'venus', 'nova', 'mission', 'cosmic', 'crew', 'craft',
  'dock', 'vent', 'valve', 'engine', 'camera', 'control', 'station', 'module', 'seven',
  'eleven', 'cargo', 'metal', 'clock', 'screen', 'signal', 'antenna', 'rescue',
  'monitor', 'rover', 'cosmos', 'crater', 'launch', 'mars', 'meteor', 'comets',
  'vacuum', 'mineral', 'contact', 'console', 'hangar', 'manual', 'scan', 'scanner',
  'venture', 'airlock', 'crane', 'machine', 'canteen', 'dome', 'commander',
];

const W8 = [
  'planet', 'pluto', 'zoom', 'orbit', 'probe', 'quasar', 'quiet', 'jupiter', 'nebula',
  'space', 'pilot', 'zero', 'box', 'fox', 'oxygen', 'galaxy', 'maze', 'quick', 'jump',
  'bump', 'plasma', 'zigzag', 'blaze', 'breeze', 'puzzle', 'explore', 'liquid',
  'unique', 'squad', 'buzz', 'zone', 'beam', 'boost', 'bubble', 'zap', 'vortex',
  'expand', 'spaceship', 'spin', 'spiral', 'pressure', 'lightning', 'thunder',
  'zipline', 'quake', 'squeeze', 'helix', 'blizzard',
];

const W9 = [
  'Mars.', 'Venus.', 'Pluto.', 'Earth,', "I'm", "it's", "don't", "can't", "we'll",
  "you're", "Zoe's", "Comet's", 'on/off', 'yes/no', 'up/down', 'in/out', 'Jupiter.',
  'Saturn,', 'Neptune.', 'Hello.', 'Halt.', 'Wait,', 'Bolt.', "Robot's", 'Oops.',
  'Galaxy.', 'Quick.', "Max's", "Kira's", 'Okay.', 'Go.', 'Stop.', 'Lift.', 'Pull.',
  'Turn,', 'Fix.', 'Weld.', 'Crate.', "That's", "Who's", "What's", "Let's", 'Yes.',
  'No,', 'Mercury.', "Titan's", "Luna's", "Rover's", 'Pump/Valve', 'Shut/Open',
  'Gear/Bolt',
];

const W10 = [
  't-10', '3-2-1', '1969', '2026', '4.5', '90/90', 'x-ray', 'lift-off', 'co-pilot',
  't-minus', 'Bay-12', 'Zone-9', 'Deck-4', '10-4', 'Gate-7', 'Apollo-11', 'Sol-3',
  '42', '360', '1,000', '99.9', 'Mars-2', 'Orbit-5', '24/7', '50/50', 'Level-8',
  'Lap-3', 'Row-6', 'Fuel-80', 'Hatch-3', 'Code-123', '1-2-3', '4-5-6', '7-8-9',
  'Ship-5', 'Ring-0', 'Moon-1', 'Lane-14', 'Dock-21', 'Port-9', 'Tank-60', 'Beam-30',
  '9.81', '3.14', '365', '1/4', 'Sector-7', 'Unit-42', 'Probe-6', 'Warp-2', 'Max-10',
  'Pad-39', 'Deck-88', 'T-5',
];

const W11 = [
  'star map', 'fuel up now', 'hold on tight', 'look out', 'go go go', 'pull up',
  'full speed', 'stay calm', 'jump now', 'keep going', 'dark matter', 'light speed',
  'do not look', 'steer left', 'turn right', 'far away', 'into orbit', 'warp drive',
  'spin out', 'black hole', 'run, Comet', 'almost there', 'deep space', 'zero gravity',
  'time slows', 'hang on', 'eyes ahead', 'lift off', 'next jump', 'gravity well',
  'push harder', 'dodge rocks', 'fly past', 'swing by', 'keep calm', 'aim high',
  'hop over', 'do it now', 'two more', 'one jump', 'lean in', 'come on', 'safe zone',
  'hurry up', 'brace now', 'faster now', 'nearly free', 'be brave', 'stay sharp',
  'big leap', 'bright stars', 'no fear', 'go Comet go', 'bounce back', 'escape it',
  'edge of space', 'gate 7 is open', 'ten more jumps', 'it pulls at us', 'the void',
  'slingshot out',
];

const W12 = [
  'We did it!', 'Is it safe?', 'Jump to Pad 7!', 'Shields up!', 'Light it up!',
  'Ready to fly?', 'Go, go, go!', 'Who is flying?', 'Mission done!', '3, 2, 1, go!',
  'Yes, we can!', 'Feel the heat?', 'Never give up!', 'Home is near.', 'A new star!',
  'Here it comes!', 'All aboard!', 'Hit the boost!', 'Take the left.', 'Shock wave!',
  'We are free!', 'Earth, hello!', 'What a ride!', 'Space is big!', 'One more jump!',
  "It's a nova!", 'Wow, look!', 'Stars explode!', 'Pod is ready!', 'Fly home safe.',
  'Bye-bye, star!', 'Hatch shut?', 'Left at Mars.', 'Where is home?', 'Light speed?',
  'Go, Comet, go!', 'Hurry, Comet!', 'Almost home!', 'Stars ahead!', 'Fire the jets!',
  'Look up there!', 'Off we go!', 'Hold tight!', 'Safe at last!', 'Zoom, zoom!',
  'Lift off, now!', 'Seat belts on!', 'Pod 4 is open.', 'Hello, Earth!', 'Go to Pad 2.',
  'Fly, Comet!', 'Keep calm!', 'We made it!', 'Bye, old star!', 'Stay on track.',
  'Run, run, run!', 'Is that Earth?', 'Steer home.', 'Blast off!',
];

// ---------- level table ----------
export const LEVELS: LevelDef[] = [
  {
    id: 'launch-pad', name: 'Launch Pad', theme: 'launchpad', threat: 'fuel-fire',
    story: 'A fuel line burst and fire is racing across the launch pad! Type to hop Cadet Comet up the gantry to his rocket.',
    lesson: { newKeys: 'fjdk', tip: 'Rest your index fingers on the bumps of F and J. D and K sit right next to them.' },
    keys: K1, words: W1, steps: 10, path: P1, width: worldWidth(P1), escape: 'rocket',
    hp: 10, threatSpeed: 5.5, threatAccel: 0, threatStart: 90, graceSeconds: 4, targetWpm: 8,
  },
  {
    id: 'moon', name: 'Moon Base', theme: 'moon', threat: 'moonquake',
    story: 'A moonquake is cracking the ground behind Comet! Bounce over the craters before the surface crumbles.',
    lesson: { newKeys: 'sla;', tip: 'All eight fingers rest on the home row: A S D F and J K L ;. Pinkies on A and ;.' },
    keys: K2, words: W2, steps: 11, path: P2, width: worldWidth(P2), escape: 'rocket',
    hp: 9, threatSpeed: 6, threatAccel: 0, threatStart: 90, graceSeconds: 4, targetWpm: 10,
  },
  {
    id: 'asteroids', name: 'Asteroid Belt', theme: 'asteroids', threat: 'meteors',
    story: 'A meteor shower is sweeping through the belt! Leap from rock to rock to reach the shuttle.',
    lesson: { newKeys: 'ei', tip: 'Middle fingers reach up: D to E, K to I. Then slide right back home.' },
    keys: K3, words: W3, steps: 12, path: P3, width: worldWidth(P3), escape: 'shuttle',
    hp: 8, threatSpeed: 6.5, threatAccel: 0, threatStart: 90, graceSeconds: 3.5, targetWpm: 12,
  },
  {
    id: 'mars', name: 'Red Mars', theme: 'mars', threat: 'dust-storm',
    story: 'A giant red dust storm is rolling over the canyon! Climb and jet across before it swallows Comet.',
    lesson: { newKeys: 'ru', tip: 'Index fingers reach up: F to R, J to U. Feel for the bumps when you come back.' },
    keys: K4, words: W4, steps: 12, path: P4, width: worldWidth(P4), escape: 'rocket',
    hp: 6, threatSpeed: 6.5, threatAccel: 0, threatStart: 90, graceSeconds: 3.5, targetWpm: 14,
  },
  {
    id: 'ice-moon', name: 'Ice Moon', theme: 'icemoon', threat: 'ice-crack',
    story: 'The ice is cracking open into the dark sea below! Skate and jump to the waiting shuttle.',
    lesson: { newKeys: 'ghty', tip: 'Index fingers stretch inward for G and H, and up for T and Y. Keep the others home.' },
    keys: K5, words: W5, steps: 14, path: P5, width: worldWidth(P5), escape: 'shuttle',
    hp: 6, threatSpeed: 7, threatAccel: 0, threatStart: 90, graceSeconds: 3, targetWpm: 16,
  },
  {
    id: 'jungle', name: 'Alien Jungle', theme: 'jungle', threat: 'slug',
    story: 'A giant space slug woke up hungry! Swing through the glowing jungle to the rocket.',
    lesson: { newKeys: 'ow', tip: 'Ring fingers reach up: S to W, L to O. Keep your wrists floating, not resting.' },
    keys: K6, words: W6, steps: 14, path: P6, width: worldWidth(P6), escape: 'rocket',
    hp: 6, threatSpeed: 7.5, threatAccel: 0, threatStart: 90, graceSeconds: 3, targetWpm: 18,
  },
  {
    id: 'station', name: 'Space Station', theme: 'station', threat: 'oxygen',
    story: 'An airlock blew open and the vacuum is pulling everything out! Float through the station to the escape shuttle.',
    lesson: { newKeys: 'cmvn', tip: 'Reach down for C, V, N and M. Eyes on the screen, not on your hands!' },
    keys: K7, words: W7, steps: 16, path: P7, width: worldWidth(P7), escape: 'shuttle',
    hp: 8, threatSpeed: 6, threatAccel: 0.02, threatStart: 90, graceSeconds: 3, targetWpm: 20,
  },
  {
    id: 'gas-giant', name: 'Gas Giant', theme: 'gasgiant', threat: 'lightning',
    story: 'A wall of lightning is crashing through the clouds! Jet between the sky docks to the shuttle.',
    lesson: { newKeys: 'bpxzq', tip: 'Pinkies stretch for Q, Z and P. B is a long reach for the left index finger.' },
    keys: K8, words: W8, steps: 16, path: P8, width: worldWidth(P8), escape: 'shuttle',
    hp: 7, threatSpeed: 7.5, threatAccel: 0.02, threatStart: 90, graceSeconds: 3, targetWpm: 22,
  },
  {
    id: 'factory', name: 'Orbital Factory', theme: 'factory', threat: 'crusher',
    story: 'The factory crushers went haywire and are stamping down the line! Run the catwalks to the rocket.',
    lesson: { newKeys: ",./'", tip: 'For a capital, hold Shift with the pinky of the OTHER hand, then tap the letter.' },
    keys: K9, words: W9, steps: 16, path: P9, width: worldWidth(P9), escape: 'rocket',
    hp: 7, threatSpeed: 7.5, threatAccel: 0.02, threatStart: 90, graceSeconds: 3, targetWpm: 24,
  },
  {
    id: 'comet', name: 'Comet Ride', theme: 'comet', threat: 'comet-tail',
    story: 'The comet is breaking apart from the tail up! Hop along the icy chunks to the shuttle.',
    lesson: { newKeys: '1234567890-', tip: 'Reach up to the number row with the same finger that types the letter below it.' },
    keys: K10, words: W10, steps: 18, path: P10, width: worldWidth(P10), escape: 'shuttle',
    hp: 7, threatSpeed: 9.5, threatAccel: 0.02, threatStart: 90, graceSeconds: 2.5, targetWpm: 26,
  },
  {
    id: 'black-hole', name: 'Black Hole', theme: 'blackhole', threat: 'black-hole',
    story: 'The event horizon is creeping closer and pulling at everything! Drift through the crystals to the portal.',
    lesson: { newKeys: ' ', tip: 'Tap the space bar with your thumb and keep a steady rhythm between words.' },
    keys: K11, words: W11, steps: 18, path: P11, width: worldWidth(P11), escape: 'portal',
    hp: 10, threatSpeed: 5.5, threatAccel: 0.01, threatStart: 90, graceSeconds: 2.5, targetWpm: 28,
  },
  {
    id: 'supernova', name: 'Supernova', theme: 'nova', threat: 'supernova',
    story: 'The old star is exploding and the shockwave is coming! One last dash to the rocket home.',
    lesson: { newKeys: '!?', tip: 'Accuracy first, speed follows. Breathe, keep a steady beat, and trust your fingers!' },
    keys: K12, words: W12, steps: 16, path: P12, width: worldWidth(P12), escape: 'rocket',
    hp: 12, threatSpeed: 4.5, threatAccel: 0.01, threatStart: 90, graceSeconds: 2.5, targetWpm: 30,
  },
];
