import { expect, it, vi } from 'vitest';
import { caseRobot, liveController, touchTheDots } from '../cases/testing';
import { encodeRecording } from '../cases/recordingFile';
import { worldItem } from '../cases/schema';
import { DEFAULT_PROJECT } from '../types/robotics';
import { buildRig } from '../utils/kinematics';
import { fixtureRobots } from './fixtures/robots';
import { buildMjcf } from './mjcf';
import type { SimRequest, SimResponse } from './sim.worker';

it('takes ownership from a saved worker selection and records an ordinary complete branch without source script writes', async () => {
  const robot = fixtureRobots().find((r) => r.id === 'arm-3dof')!;
  const rig = buildRig(robot.joints, robot.parts);
  const sourceCase = touchTheDots(robot);
  const kase = {
    ...sourceCase,
    world: { ...sourceCase.world, objects: sourceCase.world.objects.map((object) => ({ ...object, movable: true })) },
  };
  const worldId = kase.world.objects[0].id;
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
    await send({ type: 'script', commands: [{ at: 1.1, command: { v: [1, 0, 0] } }] });
    await send({ type: 'case', kase, plan: null, joints: robot.joints, kit: null });
    await send({ type: 'record', on: true });
    await send({ type: 'run', id: 1, seconds: 1.2 });
    await send({ type: 'world', change: { id: worldId, color: '#ff0000' } });
    await send({ type: 'run', id: 2, seconds: 0.2 });
    await send({ type: 'record', on: false });

    const source = replies.find((reply) => reply.type === 'recorded')!.recording!;
    const unchanged = encodeRecording(source);

    await send({ type: 'scrub', recording: source });

    const saved = replies.find((reply) => reply.type === 'scrubbed')!;

    expect(saved.checkpoints?.map((point) => point.frame)).toEqual([0, 50]);
    await send({ type: 'seek', frame: 50 });
    await send({ type: 'branch', selection: saved.selection!, frame: 50, kase: { ...kase, name: 'Changed' } });
    expect(replies.find((reply) => reply.type === 'branched')?.result).toBeNull();
    await send({ type: 'branch', selection: saved.selection!, frame: 50, kase });

    const result = replies.find((reply) => reply.type === 'branched')!.result!;

    expect(result.branch.frame).toBe(50);
    expect(result.branch.time).toBeCloseTo(1, 8);
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
    await send({ type: 'fault', joint: model.joints[0].id, kind: 'weak' });
    await send({ type: 'command', v: [-1, 0, 0] });
    await send({ type: 'play' });
    await vi.advanceTimersByTimeAsync(320);
    expect(replies.filter((reply) => reply.type === 'world').at(-1)?.looks).toEqual({
      [worldId]: { color: '#ff0000' },
    });
    await send({ type: 'controller', controller: { kind: 'hold' } });
    await send({ type: 'pause' });
    vi.useRealTimers();
    await send({ type: 'record', on: false });

    const branch = replies.find((reply) => reply.type === 'recorded')!.recording!;

    expect(branch.frames).toBeGreaterThan(60);
    expect(branch.commands!.at(-1)!.command.v).toEqual([-1, 0, 0]);
    expect(branch.faults).toContainEqual({
      joint: model.joints[0].id,
      kind: 'weak',
      at: result.branch.time,
      until: undefined,
    });
    expect(branch.world).toEqual(source.world);
    expect(branch.qpos.subarray(0, 51 * source.nq)).toEqual(source.qpos.subarray(0, 51 * source.nq));
    expect(branch.qpos.subarray(51 * source.nq)).not.toEqual(
      source.qpos.subarray(51 * source.nq, branch.frames * source.nq),
    );
    expect(encodeRecording(source)).toEqual(unchanged);
    await send({ type: 'scrub', recording: source });
    await send({ type: 'branch', selection: saved.selection!, frame: 50, kase });
    expect(replies.find((reply) => reply.type === 'branched')?.result).toBeNull();
    await send({ type: 'scrub', recording: { ...source, continuation: undefined } });
    expect(replies.find((reply) => reply.type === 'scrubbed')?.checkpoints).toEqual([]);
  } finally {
    await scope.onmessage?.({ data: { type: 'dispose' } });
    vi.useRealTimers();
    vi.unstubAllGlobals();
  }
});
