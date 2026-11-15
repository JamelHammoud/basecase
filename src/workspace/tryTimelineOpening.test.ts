import { describe, expect, it, vi } from 'vitest';
import type { SeedReplay } from '../cases/seedReplay';
import type { TryRecord } from '../cases/tries';
import type { SimModel } from '../sim/mjcfTypes';
import type { Recording } from '../sim/recorder';
import type { Simulation } from '../sim/useSimulation';
import { buildRig } from '../utils/kinematics';
import { prepareOpening, restoreSeedWorld, timelineOrigin } from './tryTimelineOpening';

const efforts = { peaks: [new Float32Array([1])], forces: [new Float32Array([0.5])] };
const recording = { frames: 1 } as Recording;
const record = { id: 'temporary', caseId: 'not-in-scene' } as TryRecord;
const original = { xml: 'original' } as SimModel;
const seededModel = { xml: 'seeded' } as SimModel;
const seeded = {
  model: seededModel,
  kase: { world: { objects: [] } },
  trips: [{ label: 'fell', frame: 0 }],
  efforts,
} as unknown as SeedReplay;

function simulation(before: 'off' | 'paused' | 'playing') {
  const world = { items: [], guests: { parts: [], joints: [] } };
  let model = before === 'off' ? null : original;
  const sim = {
    status: before === 'off' ? 'off' : 'ready',
    playing: before === 'playing',
    modelNow: () => model,
    worldNow: () => world,
    setWorld: vi.fn(() => {
      model = null;
      sim.status = 'off';
      sim.playing = false;
    }),
    start: vi.fn(async (given?: SimModel) => {
      model = given ?? original;
      sim.status = 'ready';
      sim.playing = true;
    }),
    pause: vi.fn(() => {
      sim.playing = false;
    }),
    scrub: vi.fn(async (_recording: Recording | null, given?: typeof efforts) => {
      sim.playing = false;

      return given ?? efforts;
    }),
    drive: { active: false },
  };
  const options = {
    sim: sim as unknown as Simulation,
    rig: buildRig([], []),
    parts: [],
    cases: [],
    partners: () => [],
  };

  return { sim, world, options };
}

describe('seed replay timeline transitions', () => {
  it.each(['off', 'paused', 'playing'] as const)(
    'restores %s after switching seeds and opening a saved try',
    async (before) => {
      const { sim, world, options } = simulation(before);
      const first = await prepareOpening(options, record, recording, { seeded, previous: null });
      const second = await prepareOpening(options, record, recording, { seeded, previous: first });
      const saved = await prepareOpening(options, record, recording, { previous: second });

      expect(sim.scrub).toHaveBeenNthCalledWith(1, recording, efforts);
      expect(sim.scrub).toHaveBeenLastCalledWith(recording, undefined);
      expect(sim.modelNow()).toBe(original);
      expect(saved?.before).toBe(before);
      expect(sim.setWorld).toHaveBeenLastCalledWith(world.items, world.guests);

      restoreSeedWorld(options.sim, saved!);
      await Promise.resolve();
      expect(sim.status).toBe(before === 'off' ? 'off' : 'ready');
      expect(sim.playing).toBe(before === 'playing');
      expect(sim.modelNow()).toBe(before === 'off' ? null : original);
    },
  );

  it('keeps the original off state when a saved try was open before the seed', async () => {
    const { sim, options } = simulation('off');
    const saved = await prepareOpening(options, record, recording, { previous: null });
    const replay = await prepareOpening(options, record, recording, { seeded, previous: saved });

    restoreSeedWorld(options.sim, replay!);
    await Promise.resolve();
    expect(sim.status).toBe('off');
    expect(sim.modelNow()).toBeNull();
  });

  it('discards a seed opening canceled during loading before it can scrub the current world', async () => {
    const { sim, options } = simulation('off');
    let current = true;

    sim.start.mockImplementation(async () => {
      current = false;
    });

    expect(
      await prepareOpening(options, record, recording, { seeded, previous: null, current: () => current }),
    ).toBeNull();
    expect(sim.scrub).not.toHaveBeenCalled();
  });

  it('retains the original world when a second seed supersedes one still opening', async () => {
    const { sim, world, options } = simulation('off');
    const origin = timelineOrigin(options.sim, seeded, null);
    const first = prepareOpening(options, record, recording, { seeded, previous: origin, current: () => false });
    const second = prepareOpening(options, record, recording, { seeded, previous: origin });
    const replay = await second;

    expect(await first).toBeNull();
    restoreSeedWorld(options.sim, replay!);
    expect(sim.setWorld).toHaveBeenLastCalledWith(world.items, world.guests);
    expect(sim.status).toBe('off');
  });
});
