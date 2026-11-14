import * as THREE from 'three';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
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

afterEach(() => layers.splice(0).forEach((layer) => layer.dispose()));

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
});
