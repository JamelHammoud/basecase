import { afterEach, describe, expect, it, vi } from 'vitest';
import { Matrix4 } from 'three';
import { findPort, worldPort } from '../agent/ports';
import { shapeKey } from '../print/shapeKey';
import { box } from '../sim/fixtures/parts';
import type { LightenResult } from '../strength/lighten';
import { DEFAULT_PROJECT, type ScenePart } from '../types/robotics';
import { isPrinted } from '../utils/bom';
import { buildPartGroup, releasePartGroup } from '../three/buildPartMesh';
import { localTriangles } from '../three/meshMeasure';
import { lightenResultInFrame } from '../three/analysis/lightenFrame';
import { docFromParts, pushHistory, trackedOf, travelProject } from './docHistory';
import { applyLighten, canLighten, lightenedPart } from './lighten';
import * as loads from './lightenLoads';

afterEach(() => vi.restoreAllMocks());

const positions = new Float32Array([-10, -5, -3, 10, -5, -3, 0, 5, 3]);
const result: LightenResult = {
  positions,
  originalVolumeMm3: 1200,
  volumeMm3: 600,
  volumeShare: 0.5,
  originalGrams: 2,
  grams: 1,
  massShare: 0.5,
  iterations: 20,
  compliance: [1],
  cellMm: 1,
  ms: 10,
};

function printedPart(): ScenePart {
  return {
    ...box('bracket', [12, 30, 8], [20, 10, 6], 50),
    kind: 'cad_part',
    rotation: [20, 30, 40],
    cad: {
      language: 'openscad',
      code: 'cube([20,6,10]);',
      positions: [0, 0, 0],
      indices: [],
      originOffset: [2, 3, 4],
      baseSize: [20, 10, 6],
      volume: 1200,
      ports: [{ name: 'mount', position: [0, 0, 0], axis: [0, 0, 1], kind: 'bore', diameterMm: 3 }],
    },
    mates: [{ port: 'mount', target: 'base', targetPort: 'mount', type: 'fastened' }],
  };
}

function setup() {
  const source = printedPart();
  let doc = docFromParts([source]);
  let project = DEFAULT_PROJECT;
  const commitParts = vi.fn((update: (current: ScenePart[]) => ScenePart[]) => {
    doc = pushHistory(doc, update(doc.parts), trackedOf(project));
  });
  const viewport = { lightenPart: vi.fn(async () => result) };
  const context = {
    parts: () => doc.parts,
    project: () => project,
    viewport: () => viewport,
    commitParts,
  } as unknown as Parameters<typeof applyLighten>[0];

  return {
    source,
    viewport,
    context,
    commitParts,
    parts: () => doc.parts,
    history: () => doc,
    travel: (direction: 'undo' | 'redo') => {
      const moved = travelProject(doc, project, { direction })!;

      doc = moved.doc;
      project = moved.project;
    },
    replace: (next: ScenePart[]) => (doc = { ...doc, parts: next }),
    replaceProject: (next: typeof project) => (project = next),
  };
}

describe('Lighten scene edit', () => {
  it('keeps affine mounting ports and applies a retained sheet frame exactly once to the worker mesh', () => {
    const part = printedPart();

    part.dimensions = { width: 40, height: 30, depth: 24 };
    part.sheetTransform = new Matrix4().set(1.2, 0.2, 0, 3, 0.2, 1.4, 0, -2, 0, 0, 1, 1, 0, 0, 0, 1).toArray();

    const returned = lightenResultInFrame({ ...result, positions: positions.slice() }, part.sheetTransform);
    const changed = lightenedPart(part, returned);
    const group = buildPartGroup(changed, false);
    const actual = localTriangles(group);

    expect(canLighten(part)).toBe(true);
    expect(changed.sheetTransform).toEqual(part.sheetTransform);
    expect(worldPort(changed, findPort(changed, 'mount')!)).toEqual(worldPort(part, findPort(part, 'mount')!));
    actual.forEach((value, index) => expect(value).toBeCloseTo(positions[index], 4));
    expect(actual).toHaveLength(positions.length);
    expect(returned.massShare).toBe(result.massShare);
    releasePartGroup(group);
  });

  it('keeps identity and world ports while replacing the printed geometry and its print revision', () => {
    const part = printedPart();
    const changed = lightenedPart(part, result);

    expect(changed).toMatchObject({ id: part.id, dimensions: part.dimensions, mates: part.mates });
    expect(changed.kind).toBe('sculpt_mesh');
    expect(changed.sculptMesh?.positions).toEqual([-0.5, -0.5, -0.5, 0.5, -0.5, -0.5, 0, 0.5, 0.5]);
    expect(worldPort(changed, findPort(changed, 'mount')!)).toEqual(worldPort(part, findPort(part, 'mount')!));
    expect(changed.massG).toBeUndefined();
    expect(changed.cad?.volume).toBeUndefined();
    expect(isPrinted(changed)).toBe(true);
    expect(shapeKey(changed)).not.toBe(shapeKey(part));
  });

  it('commits one edit after the worker succeeds and restores it with undo and redo', async () => {
    vi.spyOn(loads, 'lightenLoads').mockResolvedValueOnce({ jobs: [], frozen: { lines: [], boxes: [] } });

    const state = setup();

    state.viewport.lightenPart.mockResolvedValueOnce({ ...result, volumeShare: 0.6 });

    const reply = await applyLighten(state.context, { id: 'bracket' });

    expect(reply.text).toBe('Lightened bracket to 50% of its original mass.');
    expect(state.commitParts).toHaveBeenCalledOnce();
    expect(state.parts()[0].id).toBe(state.source.id);
    expect(state.parts()[0].kind).toBe('sculpt_mesh');
    expect(state.parts()[0].sculptMesh?.positions.length).toBeGreaterThan(0);
    expect(state.history().past).toHaveLength(1);

    const changed = state.parts();

    state.travel('undo');
    expect(state.parts()).toEqual([state.source]);
    expect(state.parts()[0]).toBe(state.source);
    expect(state.history().past).toHaveLength(0);
    state.travel('redo');
    expect(state.parts()).toBe(changed);
    expect(state.viewport.lightenPart).toHaveBeenCalledWith(
      expect.objectContaining({ targetShare: 0.5, minWallMm: 1.5 }),
    );
  });

  it('discards a worker result after an intervening scene edit', async () => {
    vi.spyOn(loads, 'lightenLoads').mockResolvedValueOnce({ jobs: [], frozen: { lines: [], boxes: [] } });

    const state = setup();

    state.viewport.lightenPart.mockImplementationOnce(async () => {
      state.replace([...state.parts()]);

      return result;
    });

    expect((await applyLighten(state.context, { id: 'bracket' })).text).toContain('changed');
    expect(state.commitParts).not.toHaveBeenCalled();
  });

  it('accepts background try loading while rejecting changed design settings', async () => {
    vi.spyOn(loads, 'lightenLoads').mockResolvedValue({ jobs: [], frozen: {} });

    const state = setup();

    state.viewport.lightenPart.mockImplementationOnce(async () => {
      state.replaceProject({ ...DEFAULT_PROJECT, triesStored: true, tries: [] });

      return result;
    });
    expect(await applyLighten(state.context, { id: 'bracket' })).toHaveProperty('result');
    expect(state.commitParts).toHaveBeenCalledOnce();

    const edited = setup();

    edited.viewport.lightenPart.mockImplementationOnce(async () => {
      edited.replaceProject({ ...DEFAULT_PROJECT, material: 'PETG' });

      return result;
    });
    expect((await applyLighten(edited.context, { id: 'bracket' })).text).toContain('changed');
    expect(edited.commitParts).not.toHaveBeenCalled();
  });

  it('keeps the original part when load extraction or optimization fails', async () => {
    vi.spyOn(loads, 'lightenLoads').mockRejectedValueOnce(new Error('Bracket has no measured load path.'));

    const state = setup();

    expect(await applyLighten(state.context, { id: 'bracket' })).toEqual({
      text: 'Bracket has no measured load path.',
    });
    expect(state.viewport.lightenPart).not.toHaveBeenCalled();
    expect(state.commitParts).not.toHaveBeenCalled();
    expect(state.parts()).toEqual([state.source]);
  });

  it('drops a cancelled request and rejects unsupported walls without starting work', async () => {
    const collect = vi.spyOn(loads, 'lightenLoads').mockResolvedValueOnce({ jobs: [], frozen: {} });
    const state = setup();

    expect(await applyLighten(state.context, { id: 'bracket', minWallMm: 0.9 })).toEqual({
      text: 'Choose a minimum wall of at least 1 mm.',
    });
    expect(collect).not.toHaveBeenCalled();

    await applyLighten({ ...state.context, current: () => false }, { id: 'bracket' });

    expect(state.viewport.lightenPart).not.toHaveBeenCalled();
    expect(state.commitParts).not.toHaveBeenCalled();
  });

  it('rejects purchased, hidden, locked and non-solid targets before starting work', () => {
    const part = printedPart();

    expect(canLighten(part)).toBe(true);

    for (const patch of [{ kind: 'component' }, { visible: false }, { locked: true }, { role: 'reference' }] as const) {
      expect(canLighten({ ...part, ...patch })).toBe(false);
    }

    const imported: ScenePart = {
      ...part,
      kind: 'mesh',
      mesh: { file: 'motor.stl', positions: Array.from(positions), indices: [0, 1, 2], baseSize: [20, 10, 6] },
    };

    expect(canLighten(imported)).toBe(true);
    expect(canLighten({ ...imported, componentId: 'motor' })).toBe(false);
  });
});
