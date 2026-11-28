import * as THREE from 'three';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { FIXTURE_COPYRIGHT, FIXTURE_GROUND_M, FIXTURE_SPOT, fixtureTileBytes } from '../../earth/tileFixture';
import type { EarthOrigin } from '../../earth/earthOrigin';
import { Hider, hideHelpers } from './captures';
import { EarthLayer } from './earthLayer';
import type { ViewportContext } from './viewportContext';

const WIDTH = 1500;
const HEIGHT = 1000;
const QUADRANT_EAST = { min: -700, max: 1300 };
const QUADRANT_WEST = { min: -2700, max: -700 };

beforeAll(() => {
  Object.assign(globalThis, {
    window: { location: { href: 'https://app.test/' } },
    requestAnimationFrame: (run: () => void) => setTimeout(run, 0),
    cancelAnimationFrame: (handle: number) => clearTimeout(handle),
  });
});

const layers: EarthLayer[] = [];

afterEach(() => {
  layers.splice(0).forEach((layer) => layer.dispose());
  vi.restoreAllMocks();
});

const fetchTile = async (path: string) => {
  const bytes = fixtureTileBytes(path);

  if (!bytes) throw new Error(`No fixture tile at ${path}`);

  return bytes;
};

async function placed(origin: Partial<EarthOrigin> = {}) {
  const parent = new THREE.Group();
  const attributions: string[] = [];
  const layer = new EarthLayer(parent, { redraw: () => {}, attribution: (text) => attributions.push(text) });

  layers.push(layer);
  await layer.set({ origin: { ...FIXTURE_SPOT, altitudeM: null, offsetM: 0, ...origin }, fetchTile });

  return { parent, layer, attributions };
}

const camera = (from: [number, number, number], to: [number, number, number]) => {
  const view = new THREE.PerspectiveCamera(42, WIDTH / HEIGHT, 10, 1e7);

  view.position.set(...from);
  view.lookAt(...to);
  view.updateMatrixWorld();

  return view;
};

async function settle(layer: EarthLayer, view: THREE.Camera) {
  let quiet = 0;

  for (let i = 0; i < 300 && quiet < 5; i++) {
    layer.update(view, WIDTH, HEIGHT);
    await new Promise((resolve) => setTimeout(resolve, 5));
    quiet = layer.state()?.loaded === 1 ? quiet + 1 : 0;
  }
}

const enu = (scene: THREE.Vector3) => ({ east: scene.x / 1000, north: -scene.z / 1000 });

const leavesIn = (layer: EarthLayer, span: { min: number; max: number }) =>
  layer
    .visibleTiles()
    .filter((tile) => tile.error === 0)
    .filter((tile) => enu(tile.center).east > span.min && enu(tile.center).east < span.max);

describe('EarthLayer', () => {
  it('retains the prepared ground probe across redraws, altitude changes and renderer replacement', async () => {
    const { layer } = await placed();
    const { TilesRenderer } = await import('3d-tiles-renderer/three');
    const register = vi.spyOn(TilesRenderer.prototype, 'setCamera');
    const view = camera([3000, 2000, 3000], [0, 0, 0]);

    layer.update(view, WIDTH, HEIGHT);

    const probe = register.mock.calls.map(([camera]) => camera).find((camera) => camera !== view);

    expect(probe).toBeInstanceOf(THREE.PerspectiveCamera);

    if (!probe) throw new Error('Missing ground probe');

    const expected = new THREE.PerspectiveCamera(20, 1, 1, 1e7);

    expected.position.set(0, 50000, 0);
    expected.up.set(0, 0, -1);
    expected.lookAt(0, 0, 0);
    expected.updateMatrixWorld();

    const aim = vi.spyOn(probe, 'lookAt');

    for (const altitudeM of [null, FIXTURE_GROUND_M, null]) {
      await layer.set({ origin: { ...FIXTURE_SPOT, altitudeM, offsetM: 2 }, fetchTile });
      register.mockClear();

      for (let i = 0; i < 20; i++) layer.update(view, WIDTH + i, HEIGHT);

      expect(register.mock.calls.filter(([camera]) => camera === probe)).toHaveLength(altitudeM === null ? 20 : 0);
    }

    await layer.set({
      origin: { ...FIXTURE_SPOT, lat: FIXTURE_SPOT.lat + 0.00001, altitudeM: null, offsetM: 0 },
      fetchTile: (path) => fetchTile(path),
    });
    register.mockClear();
    layer.update(view, WIDTH, HEIGHT);
    expect(register.mock.calls.some(([camera]) => camera === probe)).toBe(true);
    expect(probe.matrixWorld.elements).toEqual(expected.matrixWorld.elements);
    expect(probe.matrixWorldInverse.elements).toEqual(expected.matrixWorldInverse.elements);
    expect(probe.projectionMatrix.elements).toEqual(expected.projectionMatrix.elements);
    expect(aim).not.toHaveBeenCalled();
  });

  it('samples the tiles under the origin and puts their surface on the floor', async () => {
    const { layer, attributions } = await placed();

    await settle(layer, camera([3000, 2000, 3000], [0, 0, 0]));

    const state = layer.state();

    expect(state?.surfaceM).toBeCloseTo(FIXTURE_GROUND_M, 0);
    expect(Math.abs((state?.surfaceM ?? 0) - FIXTURE_GROUND_M)).toBeLessThan(0.5);
    expect(state?.rootCenter?.[1]).toBeCloseTo(3000, -2);
    expect(layer.group.visible).toBe(true);
    expect(attributions.at(-1)).toBe(FIXTURE_COPYRIGHT);
  });

  it('sets the floor at once when the place moves within tiles already loaded', async () => {
    const { layer } = await placed();

    await settle(layer, camera([3000, 2000, 3000], [0, 0, 0]));
    await layer.set({
      origin: { ...FIXTURE_SPOT, lat: FIXTURE_SPOT.lat + 0.00001, altitudeM: null, offsetM: 0 },
      fetchTile,
    });

    expect(layer.group.visible).toBe(true);
    expect(layer.state()?.surfaceM).toBeCloseTo(FIXTURE_GROUND_M, 0);
  });

  it('keeps the floor at a given altitude and raises the robot by the offset', async () => {
    const { layer } = await placed({ altitudeM: FIXTURE_GROUND_M, offsetM: 2 });

    await settle(layer, camera([3000, 2000, 3000], [0, 0, 0]));

    expect(layer.state()?.surfaceM).toBeNull();
    expect(layer.state()?.rootCenter?.[1]).toBeCloseTo(3000 - 2000, -2);
  });

  it('loads finer tiles near the camera only, and moves them with it', async () => {
    const { layer } = await placed({ altitudeM: FIXTURE_GROUND_M });
    const east: [number, number, number] = [800_000, 40_000, -900_000];
    const west: [number, number, number] = [-2_200_000, 40_000, 2_100_000];

    await settle(layer, camera(east, [-1_700_000, 0, 1_600_000]));

    expect(leavesIn(layer, QUADRANT_EAST).length).toBeGreaterThan(0);
    expect(leavesIn(layer, QUADRANT_WEST)).toEqual([]);
    expect(layer.visibleTiles().some((tile) => tile.error > 0)).toBe(true);

    await settle(layer, camera(west, [800_000, 0, -900_000]));

    expect(leavesIn(layer, QUADRANT_WEST).length).toBeGreaterThan(0);
    expect(leavesIn(layer, QUADRANT_EAST)).toEqual([]);
  });

  it('never shows in the captures Checks read', async () => {
    const { parent, layer } = await placed();
    const hider = new Hider();
    const ctx = { stage: { overlays: parent, brushCursor: new THREE.Object3D() } } as unknown as ViewportContext;

    await settle(layer, camera([3000, 2000, 3000], [0, 0, 0]));
    hideHelpers(ctx, hider, undefined);

    let shown = true;

    layer.group.traverseAncestors((ancestor) => (shown &&= ancestor.visible));
    expect(layer.group.visible && shown).toBe(false);
  });

  it('hides with the scene’s Show Map and clears its attribution', async () => {
    const { layer, attributions } = await placed();

    await settle(layer, camera([3000, 2000, 3000], [0, 0, 0]));
    await layer.set({ origin: { ...FIXTURE_SPOT, altitudeM: null, offsetM: 0, hidden: true }, fetchTile });

    expect(layer.group.visible).toBe(false);
    expect(layer.state()).toBeNull();
    expect(attributions.at(-1)).toBe('');
  });

  it('stays hidden when Hide Map lands while the renderer is still loading', async () => {
    const layer = new EarthLayer(new THREE.Group(), { redraw: () => {}, attribution: () => {} });
    const origin = { ...FIXTURE_SPOT, altitudeM: 16, offsetM: 0 };

    layers.push(layer);

    const first = layer.set({ origin, fetchTile });

    await layer.set({ origin: { ...origin, hidden: true }, fetchTile });
    await first;

    expect(layer.group.visible).toBe(false);
    expect(layer.state()).toBeNull();
  });
});
