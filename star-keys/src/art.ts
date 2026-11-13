// Procedural pixel art for Star Keys. Implements ArtAPI from types.ts.
import type { ArtAPI } from './types.ts';
import { drawHero } from './art/hero.ts';
import { renderBackground } from './art/backgrounds.ts';
import { drawConnector, drawPlatform } from './art/platforms.ts';
import { drawThreat } from './art/threats.ts';
import { drawEscape, ESCAPE_DOOR } from './art/escape.ts';
import { heart, worldIcon } from './art/icons.ts';

export { renderBackground, drawHero, drawPlatform, drawThreat, drawEscape, drawConnector, heart, worldIcon, ESCAPE_DOOR };

export const art: ArtAPI = { renderBackground, drawHero, drawPlatform, drawThreat, drawEscape, drawConnector, heart, worldIcon };
