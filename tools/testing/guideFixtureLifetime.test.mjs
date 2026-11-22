import { expect, it } from 'vitest';
import { stubKitGuideWorker } from '../../e2e/kitGuideWorker';

it.each(['fetch', 'body', 'fulfill'])(
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
      const response = {
        headers: () => ({}),
        text: async () => {
          if (phase === 'body') fail();

          return 'self.onmessage = () => {};';
        },
      };
      const route = {
        fetch: async () => {
          if (phase === 'fetch') fail();

          return response;
        },
        fulfill: async () => {
          if (phase === 'fulfill') fail();
        },
      };

      await stubKitGuideWorker(page);

      const pending = handlers[0](route);

      if (closed) await expect(pending).resolves.toBeUndefined();
      else await expect(pending).rejects.toBe(error);
    }
  },
);
