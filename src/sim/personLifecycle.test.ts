import { expect, it, vi } from 'vitest';
import { personEncounterFixture } from '../cases/personEncounters.fixtures';
import { caseWorldItems } from '../cases/importedWorldItems';
import { caseRobot } from '../cases/testing';
import { DEFAULT_PROJECT } from '../types/robotics';
import { buildRig } from '../utils/kinematics';
import { buildMjcf } from './mjcf';
import type { SimRequest, SimResponse } from './sim.worker';

it('cancels loading, pauses, resets, switches scenes and disposes without leaving person motion behind', async () => {
  const fixture = personEncounterFixture(0);
  const input = {
    ...caseRobot(fixture.robot),
    rig: buildRig(fixture.robot.joints, fixture.robot.parts),
    project: DEFAULT_PROJECT,
  };
  const model = buildMjcf({ ...input, world: caseWorldItems(fixture.kase) });
  const empty = buildMjcf(input);
  const replies: SimResponse[] = [];
  const scope = {
    onmessage: null as ((event: { data: SimRequest }) => Promise<void>) | null,
    postMessage: (message: SimResponse, transfer: Transferable[]) =>
      replies.push(structuredClone(message, { transfer })),
  };
  const send = async (data: SimRequest) => {
    await scope.onmessage!({ data: structuredClone(data) });
    expect(replies.filter((reply) => reply.type === 'error')).toEqual([]);
  };

  vi.stubGlobal('self', scope);

  try {
    await import('./sim.worker');

    const pending = scope.onmessage!({ data: { type: 'load', model, loadId: 1 } });

    await send({ type: 'dispose' });
    await pending;
    expect(replies.filter((reply) => reply.type === 'ready')).toEqual([]);
    await send({ type: 'load', model, loadId: 2 });

    const initial = lastFrame(replies);

    vi.useFakeTimers();
    await send({ type: 'play' });
    await vi.advanceTimersByTimeAsync(1000);
    await send({ type: 'pause' });

    const paused = lastFrame(replies);
    const count = replies.length;

    expect(paused.stats.time).toBeGreaterThan(0.5);
    expect(paused.poses).not.toEqual(initial.poses);
    await vi.advanceTimersByTimeAsync(1000);
    expect(replies).toHaveLength(count);
    await send({ type: 'reset' });
    expect(lastFrame(replies).poses).toEqual(initial.poses);
    await send({ type: 'load', model: empty, loadId: 3 });
    expect(lastFrame(replies).poses).toHaveLength(empty.bodies.length * 7);
    await send({ type: 'dispose' });

    const disposed = replies.length;

    await vi.advanceTimersByTimeAsync(1000);
    expect(replies).toHaveLength(disposed);
  } finally {
    await scope.onmessage?.({ data: { type: 'dispose' } });
    vi.useRealTimers();
    vi.unstubAllGlobals();
  }
});

function lastFrame(replies: SimResponse[]) {
  const frames = replies.filter((reply) => reply.type === 'frame');

  return frames.at(-1)!;
}
