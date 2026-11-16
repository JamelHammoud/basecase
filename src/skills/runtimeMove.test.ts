import { expect, it, vi } from 'vitest';
import { fixtureModel } from './fixtureModels';
import { quadSit } from './moveFixtures';
import { moveAnalysis, moveEnvironment } from './moveEnvironment';
import { routeTask } from './router';
import { runMoveWork } from './runtimeMove';
import type { SkillRunner } from './skillsClient';
import type { ReplyTo } from './skillsJob';

it('reports an infrastructure failure that arrives while the move worker is running', async () => {
  let failure: string | undefined;
  const refuse = vi.fn();
  const model = fixtureModel('quad-servo');
  const animation = quadSit();
  const runner = (async () => {
    failure = 'The training computer refused the connection.';

    const reply: ReplyTo<'move'> = {
      type: 'move',
      outcome: {
        environment: moveEnvironment(model, animation),
        outcome: {
          kind: 'not-found',
          route: routeTask(moveAnalysis(model)),
          cost: { wallS: 0, steps: 0 },
          attempts: [],
          reason: 'No policy passed Arena.',
        },
      },
    };

    return reply;
  }) as SkillRunner;

  await runMoveWork({
    model,
    animation,
    ports: {
      forge: async () => ({ ok: false, policy: null, events: [], stderr: '' }),
      signal: new AbortController().signal,
    },
    deps: {
      runner,
      save: async () => {},
      forge: vi.fn(),
      loadSkill: async () => null,
      onRecord: vi.fn(),
      onChange: vi.fn(),
    },
    error: () => failure,
    keep: vi.fn(),
    refuse,
  });
  expect(refuse).toHaveBeenCalledWith(`move:${animation.id}`, failure);
});
