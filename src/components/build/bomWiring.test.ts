import { describe, expect, it, vi } from 'vitest';
import { so101 } from '../../wiring/fixtures';
import { analyzeWiring } from '../../wiring/routeAnalysis';
import type { Netlist } from '../../wiring/netlist';
import { buildBom, bomToCsv } from '../../utils/bom';
import { bomCart } from './cart';
import { bomWiring, wiringForScene } from './bomWiring';

function pendingWiring() {
  let resolve!: (wiring: Netlist) => void;
  const promise = new Promise<Netlist>((complete) => {
    resolve = complete;
  });

  return { promise, resolve };
}

describe('Build panel cable measurements', () => {
  it('keeps measured purchase and export lines while unrelated checks become stale', async () => {
    const base = so101();
    const scene = { ...base, project: { ...base.project, joints: [] } };
    const wiring = analyzeWiring(scene, []);
    const query = vi.fn(async () => wiring);
    const source = bomWiring();
    const ready = new Promise<void>((resolve) => source.subscribe(resolve));

    source.load(scene, query);
    await ready;

    const changed = { ...scene, project: { ...scene.project, budgetUsd: 200 } };
    const purchases = {
      'supply:waveshare-servo-cable-5264-300': {
        packQty: 6,
        priceUsd: 1.99,
        checkedAt: '2026-11-14',
        asin: 'B0ABCDEFGH',
      },
    };
    const measured = wiringForScene(source.snapshot(), changed);
    const bom = buildBom({ ...changed, purchases, measures: {}, wiring: measured });

    source.load(changed, query);
    expect(query).toHaveBeenCalledTimes(1);
    expect(measured).toBe(wiring);
    expect(bom.lines.find((line) => line.key === 'supply:waveshare-servo-cable-5264-300')?.qty).toBe(6);
    expect(bomCart(bom.lines).amazonUrl).toContain('B0ABCDEFGH');
    expect(bomToCsv(bom, {})).toContain('Waveshare 5264 Servo Cable 300 mm');
    expect(bom.lines.some((line) => line.key === 'supply:servo-cable-5264-3pin')).toBe(false);
  });

  it('rejects an older response after the route choice changes and reuses neither stale result', async () => {
    const scene = so101();
    const old = pendingWiring();
    const fresh = pendingWiring();
    const source = bomWiring();
    const query = vi.fn().mockReturnValueOnce(old.promise).mockReturnValueOnce(fresh.promise);
    const changed = { ...scene, project: { ...scene.project, wiring: [] } };
    const measured = analyzeWiring(changed, []);

    source.load(scene, query);
    source.load(changed, query);
    old.resolve(analyzeWiring(scene, []));
    await old.promise;
    expect(wiringForScene(source.snapshot(), changed)).toBeUndefined();
    fresh.resolve(measured);
    await fresh.promise;
    expect(wiringForScene(source.snapshot(), changed)).toBe(measured);
    expect(wiringForScene(source.snapshot(), scene)).toBeUndefined();
  });

  it('leaves purchase and export actions unready when the current routing request fails', async () => {
    const scene = so101();
    const source = bomWiring();
    const query = async () => {
      throw new Error('Couldn’t load the servo model.');
    };
    const ready = new Promise<void>((resolve) => source.subscribe(resolve));

    source.load(scene, query);
    await ready;
    expect(wiringForScene(source.snapshot(), scene)).toBeUndefined();
    expect(source.snapshot()?.error).toBe('Couldn’t load the servo model.');
  });

  it('stops publishing when an effect is cleaned up and can restart with the same pending worker request', async () => {
    const scene = so101();
    const pending = pendingWiring();
    const source = bomWiring();
    const publish = vi.fn();
    const query = async () => pending.promise;
    const wiring = analyzeWiring(scene, []);
    const unsubscribe = source.subscribe(publish);
    const stop = source.load(scene, query);

    stop();
    source.load(scene, query);
    pending.resolve(wiring);
    await vi.waitFor(() => expect(wiringForScene(source.snapshot(), scene)).toBe(wiring));
    expect(publish).toHaveBeenCalledTimes(1);
    unsubscribe();

    const next = { ...scene, parts: [...scene.parts] };
    const stopped = pendingWiring();
    const cleanup = source.load(next, async () => stopped.promise);

    cleanup();
    stopped.resolve(wiring);
    await stopped.promise;
    expect(wiringForScene(source.snapshot(), next)).toBeUndefined();
    expect(publish).toHaveBeenCalledTimes(1);
  });

  it('reports the same routing failure once while unrelated project settings change', async () => {
    const scene = so101();
    const source = bomWiring();
    const publish = vi.fn();
    const query = async () => {
      throw new Error('Couldn’t load the servo model.');
    };

    source.subscribe(publish);
    source.load(scene, query);
    await vi.waitFor(() => expect(publish).toHaveBeenCalledOnce());

    const result = source.snapshot();

    source.load({ ...scene, project: { ...scene.project, budgetUsd: 200 } }, query);
    await Promise.resolve();
    expect(source.snapshot()).toBe(result);
    expect(publish).toHaveBeenCalledOnce();
  });
});

it('shares an in-flight route across unrelated edits and aborts replaced scenes and disposal', async () => {
  const scene = so101();
  const source = bomWiring();
  const signals: AbortSignal[] = [];
  const pending = pendingWiring();
  const query = vi.fn((_scene, signal: AbortSignal) => {
    signals.push(signal);

    return pending.promise;
  });
  const cleanup = source.load(scene, query);

  cleanup();
  source.load({ ...scene, project: { ...scene.project, budgetUsd: 40 } }, query);
  expect(query).toHaveBeenCalledOnce();
  expect(signals[0].aborted).toBe(false);
  source.load({ ...scene, parts: [...scene.parts] }, query);
  expect(query).toHaveBeenCalledTimes(2);
  expect(signals[0].aborted).toBe(true);
  expect(signals[1].aborted).toBe(false);
  source.dispose();
  expect(signals[1].aborted).toBe(true);
  pending.resolve(analyzeWiring(scene, []));
  await pending.promise;
  expect(source.snapshot()).toBeNull();
});
