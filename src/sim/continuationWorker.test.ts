import { expect, it, vi } from 'vitest';
import { caseRobot, liveController, touchTheDots } from '../cases/testing';
import { toCommand } from '../cases/caseDrives';
import { worldItem } from '../cases/schema';
import { sha256Hex } from '../skills/hash';
import { DEFAULT_PROJECT } from '../types/robotics';
import { buildRig } from '../utils/kinematics';
import { readContinuation } from './continuationFile';
import { fixtureRobots } from './fixtures/robots';
import { buildMjcf } from './mjcf';
import type { SimRequest, SimResponse } from './sim.worker';

it('captures supported scripted Case checkpoints in the production worker and drops them on reset', async () => {
  const robot = fixtureRobots().find((r) => r.id === 'arm-3dof')!;
  const rig = buildRig(robot.joints, robot.parts);
  const source = touchTheDots(robot);
  const kase = {
    ...source,
    world: { ...source.world, objects: source.world.objects.map((object) => ({ ...object, movable: true as const })) },
  };
  const model = buildMjcf({
    ...caseRobot(robot),
    rig,
    project: DEFAULT_PROJECT,
    world: kase.world.objects.map(worldItem),
  });
  const controller = liveController(robot, rig, model);
  const replies: SimResponse[] = [];
  const scope = {
    onmessage: null as ((event: { data: SimRequest }) => Promise<void>) | null,
    postMessage: (message: SimResponse, transfer: Transferable[]) =>
      replies.push(structuredClone(message, { transfer })),
  };
  const send = async (data: SimRequest) => {
    replies.length = 0;
    await scope.onmessage!({ data: structuredClone(data) });
    expect(replies.filter((reply) => reply.type === 'error')).toEqual([]);
  };

  vi.stubGlobal('self', scope);

  try {
    await import('./sim.worker');
    await send({ type: 'load', model, controller });
    await send({ type: 'script', commands: kase.reference.timeline.map((c) => ({ at: c.at, command: toCommand(c) })) });
    await send({ type: 'case', kase, plan: null, joints: robot.joints, kit: null });
    await send({ type: 'run', id: 0, seconds: 0.04 });
    await send({ type: 'fault', joint: model.joints[0].id, kind: 'weak' });
    await send({ type: 'record', on: true });
    await send({ type: 'run', id: 1, seconds: 1.04 });
    await send({ type: 'world', change: { id: kase.world.objects[0].id, color: '#ff0000' } });
    await send({ type: 'fault', joint: model.joints[0].id, kind: null });
    await send({ type: 'run', id: 2, seconds: 1.04 });
    await send({ type: 'record', on: false });

    const result = replies.find((reply) => reply.type === 'recorded');
    const continuation = readContinuation(result!.recording!.continuation!)!;

    expect(continuation.caseHash).toBe(sha256Hex(JSON.stringify(kase)));
    expect(continuation.started).toBeCloseTo(0.04, 8);
    expect(continuation.deadline).toBe(kase.task.seconds);
    expect(continuation.checkpoints.map((point) => point.frame)).toEqual([0, 50, 100]);
    expect(continuation.checkpoints[1].engine.faults.kinds[0][1]).toBe('weak');
    expect(continuation.checkpoints[2].engine.faults.kinds).toEqual([]);
    expect(continuation.checkpoints[2].world.changes).toContainEqual({
      id: kase.world.objects[0].id,
      color: '#ff0000',
    });
    await send({ type: 'record', on: true });
    await send({ type: 'reset' });
    await send({ type: 'run', id: 3, seconds: 1.04 });
    await send({ type: 'record', on: false });
    expect(replies.find((reply) => reply.type === 'recorded')?.recording?.continuation).toBeUndefined();
  } finally {
    await scope.onmessage?.({ data: { type: 'dispose' } });
    vi.unstubAllGlobals();
  }
});
