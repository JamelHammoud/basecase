import { describe, expect, it, vi } from 'vitest';
import { comparisonFixture } from './comparisonFixtures';
import { comparisonJobs } from './comparisonJobs';
import type { ComparisonConsumer } from './comparisonClient';
import { comparisonSession, type ComparisonReads } from './comparisonSession';

const fixtureFiles = () => [
  comparisonFixture({ id: 'a', times: [0, 1, 2], values: [1, 2, 3] }),
  comparisonFixture({ id: 'b', times: [10, 11, 12], values: [10, 20, 30] }),
  comparisonFixture({ id: 'c', times: [20, 21, 22], values: [100, 200, 300] }),
];

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });

  return { promise, resolve };
}

function setup() {
  const files = fixtureFiles();
  const reads: ComparisonReads = {
    manifests: async (ids) => files.filter((file) => ids.includes(file.stored.id)).map((file) => file.stored),
    recording: async (id) => files.find((file) => file.stored.id === id)?.bytes.slice() ?? null,
  };
  const created: Array<{ consumer: ComparisonConsumer; disposed: ReturnType<typeof vi.fn> }> = [];
  const create = () => {
    const jobs = comparisonJobs();
    const disposed = vi.fn();
    const consumer: ComparisonConsumer = {
      dispose: disposed,
      call: (async (operation, payload) => {
        const run = jobs[operation] as (argument: unknown) => Promise<{ result: unknown }> | { result: unknown };

        return (await run(payload)).result;
      }) as ComparisonConsumer['call'],
    };

    created.push({ consumer, disposed });

    return consumer;
  };

  return { files, reads, created, create, session: comparisonSession(reads, create) };
}

describe('comparison consumer ownership', () => {
  it('keeps identical topics isolated through seek and repeated open and close', async () => {
    const { session, created, files } = setup();
    const originals = files.map((file) => file.bytes.slice());

    for (let n = 0; n < 10; n++) {
      const opened = await session.open(['a', 'b']);

      expect(opened?.sources.map((source) => source.stored.id)).toEqual(['a', 'b']);

      const rule = { kind: 'previous' as const, maxAge: 0.2 };
      const a = await opened!.consumers[0].call('seek', { time: 1, rule, topic: '/same' });
      const b = await opened!.consumers[1].call('seek', { time: 11, rule, topic: '/same' });

      expect(a.samples[0]).toMatchObject({ id: 'topic./same.speed', value: 2, at: 1 });
      expect(b.samples[0]).toMatchObject({ id: 'topic./same.speed', value: 20, at: 11 });
      expect(a.message.nodes).toContainEqual({ key: 'state', value: 'trigger' });
      expect(b.message.nodes).toContainEqual({ key: 'speed', value: '20' });

      if (n === 9) expect(session.deleted(['a'])).toBe(true);
      else session.close();
    }

    expect(created).toHaveLength(20);
    expect(created.every(({ disposed }) => disposed.mock.calls.length === 1)).toBe(true);
    expect(files.map((file) => file.bytes)).toEqual(originals);
  });

  it('rejects late reads after deletion, close and replacement during loading', async () => {
    const { reads, create, created } = setup();
    const first = deferred<Uint8Array | null>();
    const recording = reads.recording;

    reads.recording = (id) => (id === 'a' ? first.promise : recording(id));

    const session = comparisonSession(reads, create);
    const opening = session.open(['a', 'b']);

    expect(session.includes('a')).toBe(true);
    expect(session.deleted(['a'])).toBe(true);
    first.resolve(await recording('a'));
    expect(await opening).toBeNull();
    expect(created).toHaveLength(0);

    const pending = deferred<Uint8Array | null>();

    reads.recording = (id) => (id === 'a' ? pending.promise : recording(id));

    const replaced = session.open(['a', 'b']);
    const next = await session.open(['b', 'c']);

    pending.resolve(await recording('a'));
    expect(await replaced).toBeNull();
    expect(next?.sources.map((source) => source.stored.id)).toEqual(['b', 'c']);
    expect(session.deleted(['unrelated'])).toBe(false);
    session.close();
    expect(created.every(({ disposed }) => disposed.mock.calls.length === 1)).toBe(true);
  });

  it('disposes both consumers on replacement and refuses absent or corrupt sources', async () => {
    const { session, created, files } = setup();

    await session.open(['a', 'b']);
    await session.open(['b', 'c']);
    expect(created.slice(0, 2).every(({ disposed }) => disposed.mock.calls.length === 1)).toBe(true);
    expect(await session.open(['a', 'missing'])).toBeNull();
    expect(created.every(({ disposed }) => disposed.mock.calls.length === 1)).toBe(true);
    files[0].bytes = new Uint8Array(20);
    await expect(session.open(['a', 'b'])).rejects.toThrow();
    expect(created.every(({ disposed }) => disposed.mock.calls.length === 1)).toBe(true);
    expect(await session.open(['a', 'a'])).toBeNull();
  });

  it('rejects preparation replies that arrive after their consumers were closed', async () => {
    const { reads, create, created } = setup();
    const ready = deferred<void>();
    const release = deferred<void>();
    const gated = () => {
      const consumer = create();
      const call = consumer.call;

      consumer.call = (async (operation, payload) => {
        const result = await call(operation, payload);

        ready.resolve();
        await release.promise;

        return result;
      }) as ComparisonConsumer['call'];

      return consumer;
    };
    const session = comparisonSession(reads, gated);
    const opening = session.open(['a', 'b']);

    await ready.promise;
    session.close();
    release.resolve();
    expect(await opening).toBeNull();
    expect(created).toHaveLength(2);
    expect(created.every(({ disposed }) => disposed.mock.calls.length === 1)).toBe(true);
  });
});
