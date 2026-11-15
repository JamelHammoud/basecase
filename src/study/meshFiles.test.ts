import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerSourced, type SourcedItem } from '../data/sourcedItems';
import * as sourcedLoader from '../data/loadSourced';
import { box } from '../sim/fixtures/parts';
import { getComponentMesh, loadComponentMesh, forgetComponentMesh } from '../three/componentMeshes';
import { DEFAULT_PROJECT } from '../types/robotics';
import { platformBridge } from '../utils/platformBridge';
import { refreshStudyGeometry } from './geometry';
import { prepareStudyMeshes } from './meshFiles';
import type { StudyKnob, StudyScene } from './types';

const sourced = (id: string): SourcedItem => ({
  id,
  kind: 'part',
  name: id,
  maker: 'Fixture maker',
  mpn: id,
  spec: 'Measured fixture model',
  url: `https://maker.example/${id}`,
  group: 'Servos',
  sources: [],
  addedAt: '2026-11-14',
  link: { status: 'confirmed', checkedAt: '2026-11-14' },
  mesh: {
    size: [40, 20, 30],
    triangles: 12,
    source: 'manufacturer',
    cadUrl: 'https://maker.example/model.step',
    license: 'Fixture',
    ports: [],
  },
});

async function modelBytes(): Promise<ArrayBuffer> {
  const fsModule = 'node:fs';
  const { readFileSync } = (await import(/* @vite-ignore */ fsModule)) as { readFileSync: (url: URL) => Uint8Array };
  const data = readFileSync(new URL('../../public/parts/feetech-sts3215.glb', import.meta.url));

  return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('Study sourced model buffers', () => {
  it('prepares current and unplaced knob targets once, then refreshes in a worker without network or preload', async () => {
    const ids = ['study-source-current', 'study-source-servo', 'study-source-battery'];
    const sources = ids.map(sourced);
    const bytes = await modelBytes();
    const part = { ...box('part', [40, 50, 60], [40, 20, 30], 1), kind: 'component' as const, componentId: ids[0] };
    const scene: StudyScene = {
      parts: [part],
      project: { ...DEFAULT_PROJECT, sourced: sources },
      measures: {},
      triangles: {},
    };
    const knobs: StudyKnob[] = [
      { id: 'servo', kind: 'servo', joints: [], values: [`component:${ids[1]}|v1`, `component:${ids[1]}|v2`] },
      { id: 'battery', kind: 'battery', values: [`component:${ids[2]}`] },
    ];
    const read = vi.spyOn(platformBridge, 'sourcedMesh').mockResolvedValue(bytes);

    vi.spyOn(platformBridge, 'listSourced').mockResolvedValue(sources);

    const prepared = await prepareStudyMeshes(scene, knobs);

    expect(Object.keys(prepared.meshFiles!)).toEqual(ids);
    expect(read.mock.calls.map(([id]) => id)).toEqual(ids);
    expect(scene.meshFiles).toBeUndefined();

    const triangles = { fresh: new Float32Array([1, 2, 3]) };
    const project = { ...scene.project, name: 'Fresh project' };
    const replayed = await prepareStudyMeshes({ ...scene, triangles, project }, knobs);

    expect(replayed.meshFiles).toBe(prepared.meshFiles);
    expect(replayed.triangles).toBe(triangles);
    expect(replayed.project).toBe(project);
    expect(read).toHaveBeenCalledTimes(3);
    read.mockClear();
    vi.stubGlobal('window', undefined);

    const fetch = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Packaged workers have no HTTP bridge.'));
    const first = await refreshStudyGeometry(prepared, ['part']);
    const loaded = getComponentMesh(ids[0]);
    const second = await refreshStudyGeometry({ ...first, parts: [{ ...part, position: [100, 50, 60] }] }, ['part']);

    expect(first.triangles.part.length).toBeGreaterThan(0);
    expect(second.measures.part!.centroid[0] - first.measures.part!.centroid[0]).toBeCloseTo(60);
    expect(first.servoOutputs?.part).toMatchObject({ axis: [0, 1, 0], alternates: [] });
    expect(second.servoOutputs!.part.point[0] - first.servoOutputs!.part.point[0]).toBeCloseTo(60);
    expect(getComponentMesh(ids[0])).toBe(loaded);
    expect(read).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('rejects a missing sourced buffer without trying an unavailable HTTP bridge', async () => {
    const record = sourced('study-source-missing');

    registerSourced([record]);
    vi.stubGlobal('window', undefined);

    const fetch = vi.spyOn(globalThis, 'fetch');
    const scene: StudyScene = {
      parts: [{ ...box('part', [0, 0, 0], [40, 20, 30], 1), kind: 'component', componentId: record.id }],
      project: { ...DEFAULT_PROJECT, sourced: [record] },
      measures: {},
      triangles: {},
    };

    await expect(refreshStudyGeometry(scene, ['part'])).rejects.toThrow('Load the sourced mesh');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('loads only the static GLB for a built-in component in a worker', async () => {
    const bytes = await modelBytes();

    forgetComponentMesh('feetech-sts3215');
    vi.stubGlobal('window', undefined);

    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(bytes));
    const library = vi.spyOn(sourcedLoader, 'loadSourced');

    await loadComponentMesh('feetech-sts3215');

    expect(fetch).toHaveBeenCalledExactlyOnceWith('/parts/feetech-sts3215.glb');
    expect(library).not.toHaveBeenCalled();
  });
});
