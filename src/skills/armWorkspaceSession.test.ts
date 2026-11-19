import { expect, it } from 'vitest';
import { fixtureModel } from './fixtureModels';
import type { WorkspaceSamples } from './armWorkspace';
import { ArmWorkspaceSession } from './armWorkspaceSession';
import type { SkillRunner } from './skillsClient';

it('aborts obsolete requests, rejects late replies and disposes the active request', async () => {
  const waiting: Array<(value: { type: 'workspace'; samples: WorkspaceSamples }) => void> = [];
  const signals: AbortSignal[] = [];
  const runner: SkillRunner = ((_job: unknown, ports: { signal?: AbortSignal }) => {
    signals.push(ports.signal!);

    return new Promise<{ type: 'workspace'; samples: WorkspaceSamples }>((resolve) => waiting.push(resolve));
  }) as SkillRunner;
  const session = new ArmWorkspaceSession(runner);
  const model = fixtureModel('arm-3dof');
  const input = { part: 'link2', point: [0, 200, 0] as [number, number, number] };
  const samples: WorkspaceSamples = {
    positions: new Float64Array(),
    configurations: new Float64Array(),
    joints: [],
    fixedValues: {},
    checks: 1,
    durationMs: 0,
  };
  const first = session.sample(model, input);
  const second = session.sample(model, input);

  expect(signals[0].aborted).toBe(true);
  waiting[0]({ type: 'workspace', samples });
  await expect(first).rejects.toThrow('Stopped.');
  waiting[1]({ type: 'workspace', samples });
  await expect(second).resolves.toBe(samples);

  const disposed = session.sample(model, input);

  session.cancel();
  expect(signals[2].aborted).toBe(true);
  waiting[2]({ type: 'workspace', samples });
  await expect(disposed).rejects.toThrow('Stopped.');
});
