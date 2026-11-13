import { test } from 'vitest';
import { Game } from './game';
import { LEVELS } from './levels';

// Hands-off run of each level: where groundhogs end up with no skills assigned.
test('hands-off run of every level', () => {
  for (const lvl of LEVELS) {
    const g = new Game(lvl);
    const deaths: Record<string, number> = {};
    let n = 0;
    while (g.status === 'playing' && n++ < lvl.timeLimit * 30) {
      g.tick();
      for (const e of g.drainEvents()) if (e.type === 'splat' || e.type === 'drown' || e.type === 'saved') deaths[e.type] = (deaths[e.type] ?? 0) + 1;
    }
    const first = g.groundhogs[0];
    console.log(`${lvl.id.padEnd(16)} status=${g.status} saved=${g.saved}/${lvl.count} need=${lvl.required} dead=${g.dead} alive=${g.alive} ${JSON.stringify(deaths)} first=${first?.state}@${first?.x},${first?.y}`);
  }
});
