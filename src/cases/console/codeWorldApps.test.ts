import loadMujoco from '@mujoco/mujoco';
import { describe, expect, it } from 'vitest';
import { fixtureRobots } from '../../sim/fixtures/robots';
import type { V3 } from '../../utils/kinematics';
import { liveCodeTry, type LiveRun } from './fixtures/liveCode';
import {
  CONVEYOR,
  conveyorCase,
  LIT,
  PICKUP,
  sweep,
  WHACK,
  WHACK_SPOTS,
  whackCase,
  wallCase,
  wallCode,
} from './fixtures/worldApps';

const robot = (id: string) => fixtureRobots().find((r) => r.id === id)!;
const near = (a: readonly number[], b: readonly number[], mm: number) => Math.hypot(...a.map((x, i) => x - b[i])) < mm;

function chase(run: LiveRun, aimed: { at: V3 | null }) {
  if (!run.mover.looks().target?.visible) return;

  const at = run.objectAt('target');

  if (aimed.at && near(aimed.at, at, 1)) return;

  aimed.at = at;
  run.engine.command({ v: [0, 0, 0], target: at });
}

function scripted(commands: Array<{ at: number; target: V3 }>) {
  const left = [...commands];

  return (run: LiveRun, t: number) => {
    while (left.length && left[0].at <= t + 1e-9) run.engine.command({ v: [0, 0, 0], target: left.shift()!.target });
  };
}

describe('a Case’s code shaping its world', { timeout: 120_000 }, () => {
  it('lights one of six spots at random, and the arm touching it scores through the Case’s logic', async () => {
    const aimed = { at: null as V3 | null };
    const { run, recording, verdict } = await liveCodeTry({
      mj: await loadMujoco(),
      kase: whackCase(),
      robot: robot('arm-3dof'),
      source: WHACK,
      player: (r) => chase(r, aimed),
    });
    const changes = (recording.world ?? []).map((w) => w.change);
    const lights = changes.filter((c) => c.visible);
    const hits = run.frame.log.events.filter(([name]) => name === 'hit');

    expect(lights.length).toBeGreaterThanOrEqual(3);
    expect(changes.filter((c) => !c.visible)).toHaveLength(hits.length);
    expect(lights.every((c) => c.id === 'target' && c.color === LIT && c.visible === true)).toBe(true);
    expect(lights.every((c) => WHACK_SPOTS.some((spot) => near(spot, c.position!, 0.01)))).toBe(true);
    expect(new Set(lights.map((c) => JSON.stringify(c.position))).size).toBeGreaterThan(1);
    expect(hits.length).toBeGreaterThanOrEqual(lights.length - 1);
    expect(run.live.logicResult?.said.filter((line) => line === 'Hit')).toHaveLength(hits.length);
    expect(verdict.passed).toBe(true);
    expect(run.store()).toEqual({ best: hits.length });
    run.engine.dispose();
  });

  it('moves the next box into place when the last one is dropped in its bin', async () => {
    const { run, recording, verdict } = await liveCodeTry({
      mj: await loadMujoco(),
      kase: conveyorCase(),
      robot: robot('arm-6dof'),
      source: CONVEYOR,
      player: scripted([...sweep(0.2), ...sweep(3.6)]),
    });
    const placed = recording.world ?? [];
    const landed = recording.t[recording.frames - 1];

    expect(placed.map((w) => w.change)).toEqual([{ id: 'box2', position: PICKUP, rotation: [0, 0, 0] }]);
    expect(placed[0].at).toBeGreaterThan(1);
    expect(placed[0].at).toBeLessThan(3.6);
    expect(landed).toBeGreaterThan(6.5);
    expect(run.live.facts['bin-count']).toBe(2);
    expect(verdict.passed).toBe(true);
    run.engine.dispose();
  });

  it('hides a wall to open a route the rover then takes', async () => {
    const mj = await loadMujoco();
    const blocked = await liveCodeTry({ mj, kase: wallCase(), robot: robot('rover-diff'), source: wallCode(false) });
    const opened = await liveCodeTry({ mj, kase: wallCase(), robot: robot('rover-diff'), source: wallCode(true) });

    expect(blocked.verdict.passed).toBe(false);
    expect(blocked.run.probes().goal).toBeGreaterThan(300);
    expect(opened.recording.world?.map((w) => w.change)).toEqual([{ id: 'wall', visible: false }]);
    expect(opened.recording.world?.[0].at).toBeGreaterThanOrEqual(2);
    expect(opened.verdict.passed).toBe(true);
    blocked.run.engine.dispose();
    opened.run.engine.dispose();
  });
});
