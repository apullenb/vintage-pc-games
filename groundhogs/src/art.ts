// Procedural pixel art for Groundhogs. Implements ArtAPI from types.ts.
import type { ArtAPI } from './types.ts';
import { drawGroundhog } from './art/groundhog.ts';
import { renderBackground } from './art/background.ts';
import { drawEntrance, drawExit, drawHazard } from './art/scenery.ts';
import { skillIcon } from './art/icons.ts';
import { createTerrainView } from './art/terrainView.ts';
import { drawBouncePad } from './art/pad.ts';

export { drawGroundhog, renderBackground, drawEntrance, drawExit, drawHazard, drawBouncePad, skillIcon, createTerrainView };

export const art: ArtAPI = { drawGroundhog, renderBackground, drawEntrance, drawExit, drawHazard, drawBouncePad, skillIcon, createTerrainView };
