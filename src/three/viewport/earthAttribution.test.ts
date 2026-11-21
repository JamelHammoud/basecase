import * as THREE from 'three';
import { afterEach, expect, it, vi } from 'vitest';
import { EarthLayer } from './earthLayer';

const fixtures = vi.hoisted(() => ({
  renderers: [] as Array<{ emit: (copyright: string | undefined, visible: boolean) => void }>,
}));

vi.mock('3d-tiles-renderer/three', async (importOriginal) => ({
  ...(await importOriginal<typeof import('3d-tiles-renderer/three')>()),
  TilesRenderer: class {
    group = new THREE.Group();
    visibleTiles = new Set();
    loadProgress = 1;
    listeners = new Map<string, (event: unknown) => void>();

    constructor() {
      fixtures.renderers.push(this);
    }

    registerPlugin() {}
    dispose() {}

    addEventListener(name: string, listener: (event: unknown) => void) {
      this.listeners.set(name, listener);
    }

    emit(copyright: string | undefined, visible: boolean) {
      this.listeners.get('tile-visibility-change')?.({
        tile: { engineData: { metadata: { asset: { copyright } } } },
        visible,
      });
    }
  },
}));

vi.mock('3d-tiles-renderer/plugins', () => ({ GLTFExtensionsPlugin: class {} }));
vi.mock('../../earth/draco', () => ({ dracoLoader: () => null }));

const origin = { lat: 0, lon: 0, altitudeM: 0, offsetM: 0 };
const fetchTile = async () => new Uint8Array(0);
const layers: EarthLayer[] = [];

afterEach(() => {
  layers.splice(0).forEach((layer) => layer.dispose());
  fixtures.renderers.length = 0;
  vi.restoreAllMocks();
});

async function placed() {
  const attribution = vi.fn();
  const layer = new EarthLayer(new THREE.Group(), { redraw: () => {}, attribution });

  layers.push(layer);
  await layer.set({ origin, fetchTile });
  attribution.mockClear();

  return { layer, attribution, renderer: fixtures.renderers.at(-1)! };
}

it('preserves frequency order, insertion ties, duplicate names and removal notifications', async () => {
  const { layer, attribution, renderer } = await placed();

  renderer.emit(' A ; B ; ; A ', true);
  expect(layer.state()?.attribution).toBe('A; B');
  renderer.emit('B; C', true);
  expect(layer.state()?.attribution).toBe('A; B; C');
  renderer.emit('B', true);
  expect(layer.state()?.attribution).toBe('B; A; C');
  renderer.emit('A; A', false);
  expect(layer.state()?.attribution).toBe('B; C');
  renderer.emit('A', true);
  renderer.emit('B; B; B', false);
  expect(layer.state()?.attribution).toBe('C; A');
  renderer.emit('C; A', false);
  renderer.emit(undefined, true);
  expect(layer.state()?.attribution).toBe('');
  expect(attribution.mock.calls.map(([text]) => text)).toEqual([
    'A; B',
    'A; B; C',
    'B; A; C',
    'B; C',
    'B; C; A',
    'C; A',
    '',
  ]);
});

it('shares each rebuilt attribution across events, state reads and hide or show', async () => {
  const { layer, attribution, renderer } = await placed();
  const sort = vi.spyOn(Array.prototype, 'sort');

  for (let i = 0; i < 100; i++) {
    renderer.emit('A; B', true);
    layer.state();
    layer.state();
  }

  expect(sort).toHaveBeenCalledTimes(100);
  expect(attribution).toHaveBeenCalledTimes(1);
  await layer.set({ origin: { ...origin, hidden: true }, fetchTile });
  renderer.emit('B', true);
  expect(layer.state()).toBeNull();
  expect(attribution).toHaveBeenLastCalledWith('');
  await layer.set({ origin, fetchTile });
  expect(attribution).toHaveBeenLastCalledWith('B; A');
  expect(layer.state()?.attribution).toBe('B; A');
  expect(sort).toHaveBeenCalledTimes(101);
});

it('clears cached text when replacing tiles and keeps layers independent', async () => {
  const first = await placed();
  const second = await placed();

  first.renderer.emit('A', true);
  second.renderer.emit('B', true);
  await first.layer.set({ origin, fetchTile: async () => new Uint8Array(0) });
  expect(first.layer.state()?.attribution).toBe('');
  expect(second.layer.state()?.attribution).toBe('B');
  fixtures.renderers.at(-1)!.emit('C', true);
  expect(first.layer.state()?.attribution).toBe('C');
  expect(second.layer.state()?.attribution).toBe('B');
});
