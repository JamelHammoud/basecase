import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BuildStepLayer } from './buildStep';
import type { BuildStepView } from './types';
import type { ViewportContext } from './viewportContext';

let now = 100;
let reduceMotion = false;
const layers: BuildStepLayer[] = [];

const removal = (): BuildStepView => ({
  shown: ['bracket', 'base'],
  moves: [{ partId: 'bracket', offset: [40, 20, 10] }],
  arrows: [],
  labels: [],
  removing: true,
});

function fixture() {
  const groups = new Map(['bracket', 'base', 'cover'].map((id) => [id, new THREE.Group()]));
  const seats = new Map([...groups.keys()].map((id, index) => [id, new THREE.Vector3(index * 50, 20, 30)]));
  const scenePose = new Map([['bracket', new THREE.Matrix4().makeTranslation(2, 3, 4)]]);
  const animators = new Set<() => boolean>();
  const afterRender = new Set<() => void>();
  const partLayer = {
    pose: scenePose,
    objects: () => [...groups],
    get: (id: string) => groups.get(id),
    applyPoseTo: vi.fn((ids: Iterable<string>) => {
      for (const id of ids) {
        const group = groups.get(id)!;

        group.position.copy(seats.get(id)!);

        const delta = partLayer.pose.get(id);

        if (delta) group.position.applyMatrix4(delta);
      }
    }),
  };
  const ctx = {
    layer: partLayer,
    stage: { overlays: new THREE.Group() },
    loop: { animators, afterRender },
    props: () => ({ pose: scenePose }),
    applyPose: () => {
      partLayer.applyPoseTo(groups.keys());
      layer.reapply();
    },
  } as unknown as ViewportContext;
  const layer = new BuildStepLayer(ctx, () => null);

  layers.push(layer);

  return {
    layer,
    groups,
    partLayer,
    scenePose,
    animators,
    afterRender,
    tick: (time: number) => {
      now = time;

      return [...animators].map((animate) => animate());
    },
    position: () => groups.get('bracket')!.position.toArray(),
  };
}

beforeEach(() => {
  now = 100;
  reduceMotion = false;
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  vi.stubGlobal('window', { matchMedia: () => ({ matches: reduceMotion }) });
});

afterEach(() => {
  layers.splice(0).forEach((layer) => layer.dispose());
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('Build step motion', () => {
  it('starts removal seated, moves only the removed part outward, and stops at the offset', () => {
    const f = fixture();

    f.layer.show(removal());
    expect(f.position()).toEqual([0, 20, 30]);
    f.partLayer.applyPoseTo.mockClear();
    expect(f.tick(549)).toEqual([false]);
    expect(f.partLayer.applyPoseTo).not.toHaveBeenCalled();
    expect(f.tick(1000)).toEqual([true]);
    expect(f.position()).toEqual([20, 30, 35]);
    expect(f.tick(1450)).toEqual([true]);
    expect(f.position()).toEqual([40, 40, 40]);
    expect(f.tick(2000)).toEqual([false]);
    expect(f.position()).toEqual([40, 40, 40]);
    expect(f.partLayer.applyPoseTo.mock.calls).toEqual([[['bracket']], [['bracket']]]);
    expect(f.groups.get('base')!.position.toArray()).toEqual([50, 20, 30]);
  });

  it('keeps assembly motion running from the offset to the seat', () => {
    const f = fixture();

    f.layer.show({ ...removal(), removing: false });
    expect(f.position()).toEqual([40, 40, 40]);
    expect(f.tick(1000)).toEqual([true]);
    expect(f.position()).toEqual([20, 30, 35]);
    expect(f.tick(1450)).toEqual([true]);
    expect(f.position()).toEqual([0, 20, 30]);
    expect(f.tick(2000)).toEqual([false]);
  });

  it('uses the final removal and assembly positions without animation for reduced motion', () => {
    const f = fixture();

    reduceMotion = true;
    f.layer.show(removal());
    expect(f.position()).toEqual([40, 40, 40]);
    expect(f.tick(1000)).toEqual([false]);
    f.layer.show({ ...removal(), removing: false });
    expect(f.position()).toEqual([0, 20, 30]);
    expect(f.tick(2000)).toEqual([false]);
  });

  it('reapplies hidden parts and restores visibility and the scene pose when cleared', () => {
    const f = fixture();
    const cover = f.groups.get('cover')!;

    f.layer.show(removal());
    f.tick(1450);
    expect(cover.visible).toBe(false);
    cover.visible = true;
    f.layer.reapply();
    expect(cover.visible).toBe(false);
    f.layer.show(null);
    expect(cover.visible).toBe(true);
    expect(f.position()).toEqual([2, 23, 34]);
    expect(f.partLayer.pose).toBe(f.scenePose);
    expect(f.tick(2000)).toEqual([false]);
    f.layer.dispose();
    expect(f.animators.size).toBe(0);
    expect(f.afterRender.size).toBe(0);
  });
});
