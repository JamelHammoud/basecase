import loadMujoco, { type MainModule } from '@mujoco/mujoco';
import { beforeAll, describe, expect, it } from 'vitest';
import { fixtureRobots } from '../sim/fixtures/robots';
import { presetCase, runCase } from './testing';
import type { Case } from './schema';
import type { WorldEvent } from './worldSet';

const rover = fixtureRobots().find((r) => r.id === 'rover-diff')!;

let mj: MainModule;

beforeAll(async () => {
  mj = await loadMujoco();
}, 60000);

function walledFlag(): Case {
  const kase = presetCase(rover, 'reach-the-flag');
  const wall = {
    id: 'wall',
    name: 'Wall',
    kind: 'box' as const,
    position: [0, 75, 465] as [number, number, number],
    rotation: [0, 0, 0] as [number, number, number],
    size: [900, 150, 40] as [number, number, number],
    color: '#888888',
    behavior: 'static' as const,
    movable: true,
  };

  return { ...kase, world: { objects: [...kase.world.objects, wall] } };
}

const OPEN: WorldEvent[] = [{ at: 0.3, id: 'wall', visible: false }];

describe('world changes in a headless run', () => {
  it('keeps the rover from the flag behind a wall, and lets it through once the wall hides', async () => {
    const blocked = await runCase(mj, walledFlag(), rover, { controller: 'reference' });
    const opened = await runCase(mj, walledFlag(), rover, { controller: 'reference', world: OPEN, record: true });

    expect(blocked.passed).toBe(false);
    expect(opened.passed).toBe(true);
    expect(opened.recording?.world).toEqual([{ ...OPEN[0], at: expect.closeTo(0.3, 1) }]);
  }, 60000);

  it('ends in the same place from the same seed and events, and elsewhere from other events', async () => {
    const run = (world: WorldEvent[]) => runCase(mj, walledFlag(), rover, { controller: 'reference', seed: 7, world });
    const [a, b, c] = await Promise.all([run(OPEN), run(OPEN), run([])]);
    const last = (r: typeof a) => Array.from(r.frames.at(-1)!.poses);

    expect(last(a)).toEqual(last(b));
    expect(last(a)).not.toEqual(last(c));
  }, 60000);
});
