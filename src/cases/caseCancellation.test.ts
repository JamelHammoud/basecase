import loadMujoco from '@mujoco/mujoco';
import { expect, it, vi } from 'vitest';
import { fixtureRobots } from '../sim/fixtures/robots';
import { fixtureMeasures } from '../sim/fixtures/parts';
import { SimEngine } from '../sim/engine';
import { CaseCheckSession, type WireRobot } from './caseCheckJob';
import { caseRunner } from './runCase';
import { caseRobot, presetCase } from './testing';

it('interrupts a physical reference, releases its engine and reuses the model for accepted seeded work', async () => {
  const mj = await loadMujoco();
  const fixture = fixtureRobots().find((robot) => robot.id === 'rover-diff')!;
  const robot = caseRobot(fixture);
  const kase = presetCase(fixture, 'reach-the-flag');
  const disposed = vi.spyOn(SimEngine.prototype, 'dispose');
  let checks = 0;

  try {
    const runner = caseRunner(mj, kase, robot, {
      controller: 'reference',
      cancelled: () => ++checks > 20,
    });

    await expect(runner.run()).rejects.toMatchObject({ name: 'AbortError' });
    expect(checks).toBe(21);
    expect(disposed).toHaveBeenCalledOnce();

    const wire: WireRobot = {
      id: fixture.id,
      parts: fixture.parts,
      joints: fixture.joints,
      measures: fixtureMeasures(fixture.parts),
      triangles: Object.fromEntries(fixture.parts.map((part) => [part.id, robot.partTriangles(part.id)!])),
    };
    const session = new CaseCheckSession();
    const stopFlag = new Int32Array(new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT));
    const job = { type: 'runs' as const, kase, modelHash: 'rover', walk: null, stop: null, seeds: [1] };

    Atomics.store(stopFlag, 0, 1);
    await expect(session.run(mj, { ...job, robot: wire, stopFlag })).rejects.toMatchObject({ name: 'AbortError' });
    await expect(session.run(mj, job)).resolves.toMatchObject({
      type: 'runs',
      result: { outcomes: [{ seed: 1, passed: true }] },
    });
  } finally {
    disposed.mockRestore();
  }
});

it('rejects cancellation during an awaited evaluation checkpoint and releases the active engine', async () => {
  const mj = await loadMujoco();
  const fixture = fixtureRobots().find((robot) => robot.id === 'rover-diff')!;
  const disposed = vi.spyOn(SimEngine.prototype, 'dispose');
  let stopped = false;
  const checkpoint = vi.fn(async () => {
    await Promise.resolve();
    stopped = true;
  });

  try {
    const runner = caseRunner(mj, presetCase(fixture, 'reach-the-flag'), caseRobot(fixture), {
      controller: 'reference',
      cancelled: () => stopped,
      checkpoint,
    });

    await expect(runner.run()).rejects.toMatchObject({ name: 'AbortError' });
    expect(checkpoint).toHaveBeenCalledOnce();
    expect(disposed).toHaveBeenCalledOnce();
  } finally {
    disposed.mockRestore();
  }
});
