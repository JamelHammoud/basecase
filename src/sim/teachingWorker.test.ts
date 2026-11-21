import { expect, it, vi } from 'vitest';
import { buildCase, builderRobot } from '../cases/caseBuilder';
import { fixtureRobot, fixtureModel } from '../skills/fixtureModels';
import { hashOf } from '../skills/hash';
import { buildRig } from '../utils/kinematics';
import { driveAccess } from './driveAccess';
import { teachingPolicy } from './fixtures/teachingPolicy';
import type { SimRequest, SimResponse } from './simMessages';

it('finishes teaching once at its deadline and preserves a second recording across scene replacement', async () => {
  const robot = fixtureRobot('arm-3dof');
  const model = fixtureModel(robot.id);
  const rig = buildRig(robot.joints, robot.parts);
  const made = buildCase({ goal: 'touch', world: 'floor' }, builderRobot(rig, robot.parts));
  const access = driveAccess({ rig, parts: robot.parts, model });

  if (!made.ok || access.kind !== 'ready' || access.setup.kind !== 'arm') throw new Error('Expected an arm Case');

  const setup = access.setup;
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
  const start = (id: number): Extract<SimRequest, { type: 'teaching' }> => ({
    type: 'teaching',
    phase: 'start',
    id,
    skill: hashOf('source'),
    setup,
    controller: { kind: 'policy', robot: model.robots[0].key, policy: teachingPolicy(model) },
    input: {
      kase: { ...made.kase, task: { ...made.kase.task, seconds: 0.2 } },
      plan: null,
      joints: robot.joints,
      kit: null,
    },
  });

  vi.stubGlobal('self', scope);

  try {
    await import('./sim.worker');
    await send({ type: 'load', model });
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
    await send(start(1));
    await vi.advanceTimersByTimeAsync(40);
    await send({ type: 'teaching', phase: 'handoff', id: 2, owner: 'operator' });
    await send({ type: 'teaching', phase: 'handoff', id: 3, owner: 'operator' });
    await send({ type: 'command', v: [0, 0, 0], joints: { arm0: 10 } });
    await vi.advanceTimersByTimeAsync(80);
    await send({ type: 'teaching', phase: 'handoff', id: 4, owner: 'policy' });
    await vi.advanceTimersByTimeAsync(300);

    const finished = replies.filter((reply) => reply.type === 'recorded' && reply.recordId === 1);

    expect(finished).toHaveLength(1);
    expect(finished[0]).toMatchObject({
      recording: {
        frames: 11,
        teaching: { ownership: [{ owner: 'policy' }, { owner: 'operator' }, { owner: 'policy' }] },
      },
    });
    await send({ type: 'record', on: false, recordId: 1 });
    expect(replies.filter((reply) => reply.type === 'recorded' && reply.recordId === 1)).toHaveLength(1);
    await send(start(5));
    await vi.advanceTimersByTimeAsync(80);
    await send({ type: 'load', model });

    const switched = replies.filter((reply) => reply.type === 'recorded' && reply.recordId === 5);

    expect(switched).toHaveLength(1);
    expect(switched[0]).toMatchObject({ recording: { teaching: { ownership: [{ owner: 'policy' }] } } });
    await send({ type: 'record', on: false, recordId: 5 });
    expect(replies.filter((reply) => reply.type === 'recorded' && reply.recordId === 5)).toHaveLength(1);
    await send(start(6));
    await vi.advanceTimersByTimeAsync(40);
    await send({ type: 'teaching', phase: 'handoff', id: 7, owner: 'operator' });
    await vi.advanceTimersByTimeAsync(40);
    await send({ type: 'dispose' });
    expect(replies.at(-1)?.type).toBe('disposed');
    expect(replies.at(-2)).toMatchObject({
      type: 'recorded',
      recordId: 6,
      recording: { teaching: { ownership: [{ owner: 'policy' }, { owner: 'operator' }] } },
    });
  } finally {
    await scope.onmessage?.({ data: { type: 'dispose' } });
    vi.useRealTimers();
    vi.unstubAllGlobals();
  }
});
