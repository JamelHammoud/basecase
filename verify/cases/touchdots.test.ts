import loadMujoco from '@mujoco/mujoco';
import { describe, expect, it } from 'vitest';
import { parseCase, runCase, touchTheDots } from '../../src/cases/testing';
import { fixtureRobots } from '../../src/sim/fixtures/robots';

const robot = (id: string) => fixtureRobots().find((r) => r.id === id)!;

describe('Touch the Dots', () => {
  for (const id of ['arm-3dof', 'arm-6dof']) {
    it(`runs on ${id}: limp fails, reference passes, repeats match`, async () => {
      const mj = await loadMujoco();
      const kase = touchTheDots(robot(id));
      const limp = await runCase(mj, kase, robot(id), { controller: 'limp' });
      const reference = await runCase(mj, kase, robot(id), { controller: 'reference' });
      const again = await runCase(mj, kase, robot(id), { controller: 'reference' });

      expect(limp.margin).toBeLessThan(0);
      expect(limp.passed).toBe(false);
      expect(reference.margin).toBeGreaterThan(0);
      expect(reference.passed).toBe(true);
      expect(again.margin).toBe(reference.margin);
    });
  }

  it('refuses a robot that cannot enter, in plain words', async () => {
    const mj = await loadMujoco();
    const kase = touchTheDots(robot('arm-3dof'));
    const r = await runCase(mj, kase, robot('rover-diff'), { controller: 'reference' });

    expect(r.passed).toBe(false);
    expect(r.refusal).toMatch(/arm|end effector|reach/i);
  });

  it('refuses a Case file from the future and hostile input', () => {
    expect(() => parseCase({ formatVersion: 999 })).toThrow();
    expect(() => parseCase({ formatVersion: 1, world: { objects: 'nope' } })).toThrow();
    expect(() => parseCase('<script>')).toThrow();
  });

  it('world objects never enter the parts list', async () => {
    const mj = await loadMujoco();
    const kase = touchTheDots(robot('arm-3dof'));
    const r = await runCase(mj, kase, robot('arm-3dof'), { controller: 'reference' });

    expect(r.model.bodies.flatMap((b) => b.parts)).not.toEqual(
      expect.arrayContaining(kase.world.objects.map((o) => o.id)),
    );
    expect(r.frames.length).toBeGreaterThan(0);
    expect(r.objectIds.length).toBeGreaterThan(0);
  });
});
