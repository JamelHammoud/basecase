import { expect, it, vi } from 'vitest';
import { buildCase, builderRobot } from '../cases/caseBuilder';
import { toCommand } from '../cases/caseDrives';
import { caseRobot, liveController } from '../cases/testing';
import { worldItem } from '../cases/schema';
import { scoreTry } from '../cases/tries';
import { robotFacts } from '../cases/robotFit';
import { DEFAULT_PROJECT } from '../types/robotics';
import { buildRig } from '../utils/kinematics';
import { fixtureRobots } from './fixtures/robots';
import { buildMjcf } from './mjcf';
import { decodeRecording, encodeRecording } from '../cases/recordingFile';
import type { SimRequest, SimResponse } from './sim.worker';

it('runs a force-limited Case through worker commands and transfers retained evidence for independent scoring', async () => {
  const robot = fixtureRobots().find((r) => r.id === 'arm-6dof')!;
  const rig = buildRig(robot.joints, robot.parts);
  const built = buildCase({ goal: 'pick', world: 'floor', values: { gripForceN: 20 } }, builderRobot(rig, robot.parts));

  if (!built.ok) throw new Error(built.problem);

  const kase = built.kase;
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
    await send({ type: 'case', kase, plan: null, joints: robot.joints, kit: null });
    await send({ type: 'record', on: true });
    await send({
      type: 'run',
      id: 0,
      seconds: kase.task.seconds,
      commands: kase.reference.timeline.map((c) => ({ at: c.at, command: toCommand(c) })),
    });
    await send({ type: 'record', on: false });

    const recording = replies.find((reply) => reply.type === 'recorded')!.recording!;
    const restored = decodeRecording(encodeRecording(recording))!;
    const source = { kase, model, recording: restored, rig, effector: robotFacts(rig, robot.parts).endEffector };

    expect(restored.forceEvidence).toEqual(recording.forceEvidence);
    expect(restored.contactForcePeak!.some((force) => force > 0)).toBe(true);
    expect((await scoreTry(source)).passed).toBe(true);
    expect(recording.continuation).toBeUndefined();
    await send({ type: 'scrub', recording: restored });
    await send({ type: 'seek', frame: 0 });
    expect(replies.find((reply) => reply.type === 'frame')).toBeDefined();
    expect(replies.find((reply) => reply.type === 'frame')!.forces).toBeUndefined();
    await send({ type: 'scrub', recording: null });
    await send({ type: 'pause' });
    expect(replies.find((reply) => reply.type === 'frame')!.forces).toBeDefined();
    await send({ type: 'caseEnd' });
    await send({ type: 'pause' });

    const endedFrame = replies.find((reply) => reply.type === 'frame');

    expect(endedFrame).toBeDefined();
    expect(endedFrame!.forces).toBeUndefined();
  } finally {
    await scope.onmessage?.({ data: { type: 'dispose' } });
    vi.unstubAllGlobals();
  }
});
