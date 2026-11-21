import { expect, it, vi } from 'vitest';
import { networkRobotEvents } from '../../e2e/networkRobotEvents';

it('drains every active telemetry delivery before browser closure and blocks later events', async () => {
  const first = Promise.withResolvers();
  const second = Promise.withResolvers();
  const deliver = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
  const forwarding = networkRobotEvents(deliver);
  const browserClosed = vi.fn();

  forwarding.emit({ event: 'status', position: 1 });
  forwarding.emit({ event: 'status', position: 2 });

  const closed = forwarding.close().then(browserClosed);

  forwarding.emit({ event: 'link', state: 'closed' });
  second.resolve();
  await new Promise((resolve) => setImmediate(resolve));
  expect(browserClosed).not.toHaveBeenCalled();
  expect(deliver.mock.calls).toEqual([[{ event: 'status', position: 1 }], [{ event: 'status', position: 2 }]]);
  first.resolve();
  await closed;
  expect(browserClosed).toHaveBeenCalledOnce();
  forwarding.emit({ event: 'status', position: 3 });
  expect(deliver).toHaveBeenCalledTimes(2);
});

it.each(['before', 'during'])('reports delivery failures %s teardown without an unhandled rejection', async (phase) => {
  const delivery = Promise.withResolvers();
  const forwarding = networkRobotEvents(() => delivery.promise);
  const failure = new Error('page.evaluate failed');

  forwarding.emit({ event: 'status' });

  if (phase === 'before') {
    delivery.reject(failure);
    await new Promise((resolve) => setImmediate(resolve));
  }

  const closed = forwarding.close();
  const assertion = expect(closed).rejects.toMatchObject({
    message: 'Network robot event delivery failed',
    errors: [failure],
  });

  if (phase === 'during') delivery.reject(failure);

  await assertion;
});
