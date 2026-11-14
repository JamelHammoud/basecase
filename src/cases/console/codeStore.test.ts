import { afterEach, describe, expect, it, vi } from 'vitest';
import type { KeyValueStore } from '../../utils/keyValueStore';
import { readFrameMessage } from './codeProtocol';
import { caseStores, storeOf, storeRefusal, type CaseStore } from './codeStore';
import { fakeClock, openTestFrame, type FrameOptions, type TestFrame } from './fixtures/codeFrames';
import { createSignalBus } from './signalBus';

const opened: TestFrame[] = [];

function open(html: string, o: Partial<FrameOptions> = {}) {
  const frame = openTestFrame(html, {
    bus: createSignalBus(),
    scope: { declared: new Set(), probes: new Set(), inputs: new Set(['code']) },
    ...o,
  });

  opened.push(frame);

  return frame;
}

afterEach(() => {
  opened.splice(0).forEach((f) => f.close());
});

function disk() {
  const saved = new Map<string, string>();
  const writes: Array<string | null> = [];
  let hold: Promise<void> = Promise.resolve();
  const backend: KeyValueStore<string> = {
    get: async (key) => saved.get(key),
    put: async (key, value) => {
      await hold;
      writes.push(value);
      saved.set(key, value);
    },
    delete: async (key) => {
      await hold;
      writes.push(null);
      saved.delete(key);
    },
  };

  const pause = () => {
    let release = () => undefined as void;

    hold = new Promise((done) => {
      release = done;
    });

    return () => release();
  };

  return { saved, writes, backend, pause };
}

const HIGH_SCORE = `<p data-best></p>
<script>
let best = 0;
basecase.store.get().then((kept) => {
  best = kept ? kept.best : 0;
  document.body.dataset.best = String(best);
});
window.score = (points) => {
  if (points <= best) return;
  best = points;
  basecase.store.set({ best }).then((reply) => { window.saved = reply; });
};
</script>`;

const panelFor = (store: CaseStore | null) => open(HIGH_SCORE, { store });

describe('a Case’s store from its code', () => {
  it('keeps a high score through a scene reload and through Reset', async () => {
    const { saved, backend } = disk();
    const before = caseStores(backend);
    const first = panelFor(storeOf(before, 'whack'));

    await vi.waitFor(() => expect(first.body.dataset.best).toBe('0'));
    first.run('score(12)');
    await vi.waitFor(() => expect(first.window.saved).toEqual({ ok: true }));
    first.run("basecase.action('reset')");
    await vi.waitFor(() => expect(first.log.fired).toEqual(['reset']));
    await before.saved();
    first.close();
    expect(saved.get('whack')).toBe('{"best":12}');

    const reloaded = panelFor(storeOf(caseStores(backend), 'whack'));

    await vi.waitFor(() => expect(reloaded.body.dataset.best).toBe('12'));
  });

  it('shares a store between one Case’s panels and keeps Cases apart', async () => {
    const stores = caseStores(disk().backend);
    const scorer = panelFor(storeOf(stores, 'whack'));

    await vi.waitFor(() => expect(scorer.body.dataset.best).toBe('0'));
    scorer.run('score(5)');
    await vi.waitFor(() => expect(scorer.window.saved).toEqual({ ok: true }));

    const sibling = panelFor(storeOf(stores, 'whack'));
    const other = panelFor(storeOf(stores, 'conveyor'));

    await vi.waitFor(() => expect(sibling.body.dataset.best).toBe('5'));
    await vi.waitFor(() => expect(other.body.dataset.best).toBe('0'));
  });

  it('writes one value at a time, the newest last, and clears with set(null) or when the Case goes', async () => {
    const { saved, writes, backend, pause } = disk();
    const stores = caseStores(backend);
    const release = pause();

    [1, 2, 3, 4, 5].forEach((best) => stores.set('whack', JSON.stringify({ best })));
    release();
    await stores.saved();
    expect(writes).toEqual(['{"best":1}', '{"best":5}']);
    expect(await stores.get('whack')).toBe('{"best":5}');

    const panel = open('<script>basecase.store.set(null).then((r) => { window.cleared = r; });</script>', {
      store: storeOf(stores, 'whack'),
    });

    await vi.waitFor(() => expect(panel.window.cleared).toEqual({ ok: true }));
    await stores.saved();
    expect(saved.has('whack')).toBe(false);

    stores.set('conveyor', '{"next":3}');
    stores.delete('conveyor');
    await stores.saved();
    expect(saved.has('conveyor')).toBe(false);
    expect(await stores.get('conveyor')).toBeNull();
  });

  it('answers null and keeps nothing where there’s no studio, as in the web gallery', async () => {
    const panel = panelFor(null);

    await vi.waitFor(() => expect(panel.body.dataset.best).toBe('0'));
    panel.run('score(4)');
    await vi.waitFor(() =>
      expect(panel.window.saved).toEqual({ ok: false, problem: 'the store works only in the studio' }),
    );
    expect(panel.log.failed).toEqual([]);
  });
});

describe('store exploits', () => {
  it('refuses a 1 MB write and keeps the last value', async () => {
    const { saved, backend } = disk();
    const stores = caseStores(backend);
    const panel = open(
      `<script>
        basecase.store.set({ best: 3 });
        basecase.store.set('x'.repeat(1 << 20)).then((r) => { window.big = r; });
        basecase.store.set('€'.repeat(30000)).then((r) => { window.wide = r; });
      </script>`,
      { store: storeOf(stores, 'whack') },
    );
    const tooBig = { ok: false, problem: 'the store takes at most 64 KB' };

    await vi.waitFor(() => expect(panel.window.wide).toEqual(tooBig));
    expect(panel.window.big).toEqual(tooBig);
    await stores.saved();
    expect(saved.get('whack')).toBe('{"best":3}');
    expect(panel.bridge.report().refused).toEqual([
      'store refused: the store takes at most 64 KB',
      'store refused: the store takes at most 64 KB',
    ]);
  });

  it('takes the value as a JSON string, so a shared-reference graph is never walked in the studio', () => {
    let graph: unknown = 0;

    for (let i = 0; i < 31; i++) graph = [graph, graph];

    expect(readFrameMessage({ type: 'store-set', id: 1, json: graph })).toBe('sent a malformed store-set message');
    expect(readFrameMessage({ type: 'store-set', id: 1, value: graph })).toBe('sent a malformed store-set message');
    expect(readFrameMessage({ type: 'store-set', id: 1, json: '{"best":1}' })).toEqual({
      type: 'store-set',
      id: 1,
      json: '{"best":1}',
    });
    expect(storeRefusal('{"best":')).toBe('the store takes JSON');
    expect(storeRefusal(null)).toBeNull();
  });

  it('takes 10 store calls a second and refuses the rest', async () => {
    const clock = fakeClock();
    const { saved, backend } = disk();
    const stores = caseStores(backend);
    const panel = open(
      `<script>
        window.replies = [];
        for (let i = 1; i <= 50; i++) basecase.store.set({ best: i }).then((r) => window.replies.push(r.ok));
      </script>`,
      { clock, store: storeOf(stores, 'whack') },
    );
    const replies = () => panel.window.replies as boolean[];

    await vi.waitFor(() => expect(replies()).toHaveLength(50));
    expect(replies().filter(Boolean)).toHaveLength(10);
    await stores.saved();
    expect(saved.get('whack')).toBe('{"best":10}');

    clock.tick(1000);
    panel.run('basecase.store.set({ best: 99 }).then((r) => { window.later = r; })');
    await vi.waitFor(() => expect(panel.window.later).toEqual({ ok: true }));
  });
});
