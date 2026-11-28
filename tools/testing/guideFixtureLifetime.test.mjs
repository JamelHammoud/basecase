import { expect, it } from 'vitest';
import { stubKitGuideWorker } from '../../e2e/kitGuideWorker';
import { kitArmScene } from '../../src/kit/entry.fixtures';

const scene = kitArmScene();
const job = {
  guideId: 'fixture-guide',
  title: scene.name,
  parts: scene.parts,
  partKeys: Object.fromEntries(scene.parts.map((part) => [part.id, part.id])),
  project: scene.project,
  date: '2026-11-28',
  mark: '',
};

it.each(['continue', 'fulfill', 'render request', 'render reply'])(
  'keeps %s errors visible only while the guide fixture page is live',
  async (phase) => {
    for (const closed of [false, true]) {
      const handlers = [];
      const error = new Error('Guide request failed');
      let retired = false;
      const fail = () => {
        retired = closed;

        throw error;
      };
      const page = {
        isClosed: () => retired,
        context: () => ({ route: async (_match, handler) => handlers.push(handler) }),
      };
      const query = phase === 'continue' ? '?basecase-guide-original=1' : '';
      const route = {
        request: () => ({
          url: () => `https://example.com/assets/guide.worker-fixture.js${query}`,
          postDataJSON: () => {
            if (phase === 'render request') fail();

            return job;
          },
        }),
        continue: fail,
        fulfill: fail,
      };

      await stubKitGuideWorker(page);

      const pending = handlers[phase.startsWith('render') ? 1 : 0](route);

      if (closed) await expect(pending).resolves.toBeUndefined();
      else await expect(pending).rejects.toBe(error);
    }
  },
);
