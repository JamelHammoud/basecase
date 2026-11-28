import { expect, it } from 'vitest';
import { stubKitGuideWorker } from '../../e2e/kitGuideWorker';

it.each(['continue', 'fulfill', 'render'])(
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
          postDataJSON: fail,
        }),
        continue: fail,
        fulfill: fail,
      };

      await stubKitGuideWorker(page);

      const pending = handlers[phase === 'render' ? 1 : 0](route);

      if (closed) await expect(pending).resolves.toBeUndefined();
      else await expect(pending).rejects.toBe(error);
    }
  },
);
