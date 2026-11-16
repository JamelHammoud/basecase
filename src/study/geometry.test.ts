import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { componentSize } from '../data/components';
import { box } from '../sim/fixtures/parts';
import { componentArrays } from '../three/componentGeometry';
import { provideMeshFiles } from '../three/componentMeshes';
import { measureTriangles } from '../three/meshMeasure';
import { DEFAULT_PROJECT, type ScenePart } from '../types/robotics';
import { partMatrix } from '../utils/kinematics';
import { refreshStudyGeometry } from './geometry';
import type { StudyScene } from './types';

const sceneOf = (parts: ScenePart[]): StudyScene => ({
  parts,
  project: DEFAULT_PROJECT,
  triangles: {},
  measures: {},
});

function cadBox(id: string, size: [number, number, number]): ScenePart {
  const geometry = new THREE.BoxGeometry(...size);

  return {
    ...box(id, [0, 0, 0], size, 1),
    kind: 'cad_part',
    cad: {
      language: 'openscad',
      code: 'cube([10,20,30],center=true);',
      positions: [...geometry.getAttribute('position').array],
      indices: [...geometry.index!.array],
      baseSize: size,
      originOffset: [0, 0, 0],
    },
  };
}

async function catalogBytes(id: string): Promise<ArrayBuffer> {
  const fsModule = 'node:fs';
  const { readFileSync } = (await import(/* @vite-ignore */ fsModule)) as { readFileSync: (url: URL) => Uint8Array };
  const data = readFileSync(new URL(`../../public/parts/${id}.glb`, import.meta.url));

  return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
}

function catalogPart(id: string, componentId: string): ScenePart {
  return {
    ...box(id, [40, 50, 60], [1, 1, 1], 1),
    kind: 'component',
    componentId,
    dimensions: componentSize(componentId),
    rotation: [0, 90, 0],
  };
}

describe('detached Study geometry', () => {
  it('refreshes compiled CAD and moved mates without modifying the source scene', async () => {
    const base = await refreshStudyGeometry(
      sceneOf([
        cadBox('bracket', [10, 20, 30]),
        box('mate', [0, 20, 0], [4, 4, 4], 1),
        box('untouched', [100, 0, 0], [2, 2, 2], 1),
      ]),
      ['bracket', 'mate', 'untouched'],
    );
    const snapshot = structuredClone(base);
    const part = {
      ...cadBox('bracket', [40, 20, 30]),
      position: [100, 20, 30] as [number, number, number],
      rotation: [0, 90, 0] as [number, number, number],
    };
    const parts = [part, { ...base.parts[1], position: [130, 20, 30] as [number, number, number] }, base.parts[2]];
    const scene = await refreshStudyGeometry({ ...base, parts }, ['bracket', 'mate', 'bracket']);

    expect(scene.measures.bracket?.volumeMm3).toBeCloseTo(24000);
    expect(scene.measures.bracket?.areaMm2).toBeCloseTo(5200);
    scene.measures.bracket?.min.forEach((value, i) => expect(value).toBeCloseTo([85, 10, 10][i], 8));
    scene.measures.bracket?.max.forEach((value, i) => expect(value).toBeCloseTo([115, 30, 50][i], 8));
    expect(scene.measures.bracket?.centroid).toEqual([100, 20, 30]);
    expect(scene.measures.bracket?.base).toHaveLength(4);
    measureTriangles(scene.triangles.bracket).centroid.forEach((value) => expect(value).toBeCloseTo(0, 8));
    expect(scene.measures.mate?.centroid).toEqual([130, 20, 30]);
    expect(scene.triangles.mate).toEqual(base.triangles.mate);
    expect(scene.triangles.untouched).toBe(base.triangles.untouched);
    expect(scene.measures.untouched).toBe(base.measures.untouched);
    expect(scene.parts).toBe(parts);
    expect(base).toEqual(snapshot);
  });

  it.each([['ovonic-2s-2200-50c', 'ovonic-4s-2200-35c']])(
    'loads exact catalog geometry after swapping %s for %s',
    async (originalId, componentId) => {
      const originalBytes = await catalogBytes(originalId);
      const bytes = await catalogBytes(componentId);

      provideMeshFiles({ [originalId]: originalBytes, [componentId]: bytes });

      const base = await refreshStudyGeometry(sceneOf([catalogPart('part', originalId)]), ['part']);
      const snapshot = structuredClone(base);
      const part = catalogPart('part', componentId);
      const refreshed = await refreshStudyGeometry({ ...base, parts: [part] }, ['part']);
      const expected = (await componentArrays(bytes)).pieces.flatMap((piece) => [...piece.position]);
      const local = Float32Array.from(expected);
      const matrix = partMatrix(part);
      const vector = new THREE.Vector3();
      const world = local.slice();

      for (let i = 0; i < world.length; i += 3) vector.fromArray(local, i).applyMatrix4(matrix).toArray(world, i);

      const measure = measureTriangles(world);

      expect(refreshed.triangles.part).toHaveLength(expected.length);
      expect(refreshed.triangles.part.every((value, i) => Math.abs(value - expected[i]) < 0.00001)).toBe(true);
      refreshed.measures.part?.min.forEach((value, i) => expect(value).toBeCloseTo(measure.min[i], 4));
      refreshed.measures.part?.max.forEach((value, i) => expect(value).toBeCloseTo(measure.max[i], 4));
      expect(refreshed.measures.part!.volumeMm3 / measureTriangles(local).volumeMm3).toBeCloseTo(1, 6);
      expect(refreshed.triangles.part).not.toEqual(base.triangles.part);
      expect(base).toEqual(snapshot);
    },
  );

  it('keeps a baked sheet transform in the local geometry exactly once', async () => {
    const part = {
      ...cadBox('sheet', [10, 20, 30]),
      position: [100, 0, 0] as [number, number, number],
      sheetTransform: new THREE.Matrix4().makeScale(2, 1, 1).setPosition(5, 0, 0).toArray(),
    };
    const scene = await refreshStudyGeometry(sceneOf([part]), ['sheet']);

    expect(measureTriangles(scene.triangles.sheet).min).toEqual([-5, -10, -15]);
    expect(measureTriangles(scene.triangles.sheet).max).toEqual([15, 10, 15]);
    expect(scene.measures.sheet?.centroid).toEqual([105, 0, 0]);
    expect(scene.measures.sheet?.volumeMm3).toBeCloseTo(12000);
  });

  it('refuses to build on the browser main thread', async () => {
    vi.stubGlobal('document', {});

    try {
      await expect(refreshStudyGeometry(sceneOf([]), [])).rejects.toThrow('needs a worker');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('fails a missing catalog mesh instead of grading placeholder geometry', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 404 }));
    const part = { ...catalogPart('missing', 'feetech-sts3215'), componentId: 'missing-study-model' };

    try {
      await expect(refreshStudyGeometry(sceneOf([part]), ['missing'])).rejects.toThrow(
        'Couldn’t load the missing-study-model model (404)',
      );
      await expect(refreshStudyGeometry(sceneOf([{ ...part, componentId: undefined }]), ['missing'])).rejects.toThrow(
        'Load the mesh before grading',
      );
    } finally {
      fetch.mockRestore();
    }
  });

  it('clears a stale servo output when a changed part has no actuator', async () => {
    const source = {
      ...sceneOf([box('part', [0, 0, 0], [10, 20, 30], 1)]),
      servoOutputs: {
        part: { point: [1, 2, 3] as [number, number, number], axis: [0, 1, 0] as [number, number, number] },
      },
    };
    const scene = await refreshStudyGeometry(source, ['part']);

    expect(scene.servoOutputs).toEqual({});
    expect(source.servoOutputs.part.point).toEqual([1, 2, 3]);
    expect(await refreshStudyGeometry(source, ['absent'])).toBe(source);
  });
});

it('refuses cumulative classroom geometry above the caller limit without mutating the source', async () => {
  const source = sceneOf([box('first', [0, 10, 0], [20, 20, 20], 100), box('second', [50, 10, 0], [20, 20, 20], 100)]);

  await expect(refreshStudyGeometry(source, ['first', 'second'], 20)).rejects.toThrow('Robot mesh is too large.');
  expect(source.triangles).toEqual({});
  expect(Object.keys((await refreshStudyGeometry(source, ['first', 'second'], 24)).triangles)).toEqual([
    'first',
    'second',
  ]);
});
