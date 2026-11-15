import { runInNewContext } from 'node:vm';
import { afterEach, expect, it, vi } from 'vitest';
import { stubWebTrainWorker } from '../../e2e/webTrainWorker';
import { skillFiles, skillHash } from '../../src/skills/artifacts';
import { fixtureModel } from '../../src/skills/fixtureModels';
import { holdingPolicy } from '../../src/skills/hubSkillFixtures';
import { inSkillsWorker } from '../../src/skills/skillsClient';
import { designOf } from '../../src/skills/skillsRuntime';

afterEach(() => vi.unstubAllGlobals());

async function workerFixture() {
  const routes = [];
  const context = { route: async (pattern, handle) => routes.push({ pattern, handle }) };
  const trained = await stubWebTrainWorker({ context: () => context });
  const respond = async (url, body) => {
    const route = routes.find(({ pattern }) =>
      pattern instanceof RegExp ? pattern.test(url) : url.endsWith('/__web-train'),
    );
    let response;

    await route.handle({
      request: () => ({ postDataJSON: () => body }),
      fulfill: async (options) => {
        response = options;
      },
    });

    return response;
  };
  const script = await respond('https://basecase.test/assets/skills.worker-built.js');

  vi.stubGlobal(
    'Worker',
    class {
      constructor() {
        this.scope = {
          postMessage: (data) => queueMicrotask(() => this.onmessage({ data: structuredClone(data) })),
        };
        runInNewContext(script.body, {
          self: this.scope,
          fetch: async (url, options) => {
            const response = await respond(url, JSON.parse(options.body));

            return Response.json(response.json, { status: response.status ?? 200 });
          },
        });
      }

      postMessage(data) {
        this.scope.onmessage({ data: structuredClone(data) });
      }

      terminate() {}
    },
  );

  return { trained, script };
}

it('serves an isolated worker that trains and saves through the real skills client bridge', async () => {
  const { trained, script } = await workerFixture();
  const model = fixtureModel('quad-servo');
  const job = { type: 'kit', model, design: designOf(model), entry: 'stand' };
  const forge = vi.fn(async ({ xml, job: spec }) => {
    expect(xml).toBe(model.xml);

    return { ok: true, policy: holdingPolicy(spec), events: [], stderr: '' };
  });
  const save = vi.fn(async () => {});
  const reply = await inSkillsWorker(job, { forge, save });
  const { skill } = reply.outcome;
  const hash = skillHash(skill);

  expect(script.headers?.['Cross-Origin-Embedder-Policy']).toBe('credentialless');
  expect(reply).toMatchObject({ type: 'kit', outcome: { kind: 'skill', skill: { evidence: { passed: true } } } });
  expect(skill.controller).toMatchObject({ kind: 'policy', policy: { trainedSteps: 1 } });
  expect(forge).toHaveBeenCalledOnce();
  expect(save).toHaveBeenCalledExactlyOnceWith(skillFiles(hash).skill, JSON.stringify(skill));
  expect(trained).toEqual([hash]);
});
