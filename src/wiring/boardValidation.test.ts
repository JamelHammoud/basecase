import { describe, expect, it } from 'vitest';
import { validBoardDefinition, validBoardPart } from './boardValidation';
import type { ElectronicsBoard } from './boardTypes';
import { box } from '../sim/fixtures/parts';
import { projectBoard } from './boardProjection';
import { sceneOf } from './fixtures';
import { decodeSceneFile } from '../utils/sceneFile';

const definition: ElectronicsBoard = {
  schema: 1,
  partId: 'board',
  outline: 'rectangle',
  side: 'top',
  heightMm: { top: 20, bottom: 5 },
  edgeClearanceMm: 1,
  holes: [],
  keepouts: [],
  placements: [],
};

describe('untrusted board records', () => {
  it('refuses a damaged board before portable scene data can reach editing controls', async () => {
    const file = {
      format: 'basecase-scene',
      version: 1,
      scene: { name: 'Damaged board', parts: [], project: { electronicsBoard: { ...definition, placements: null } } },
    };

    await expect(decodeSceneFile(new TextEncoder().encode(JSON.stringify(file)))).rejects.toThrow(
      'Repair the board definition',
    );
  });

  it.each([
    null,
    {},
    { ...definition, schema: 2 },
    {
      ...definition,
      routed: {
        schema: 1,
        hash: 'a'.repeat(64),
        pcb: '(kicad_pcb)',
        sourceFingerprint: 'b'.repeat(64),
        rules: null,
        external: '../../secret',
      },
    },
    { ...definition, partId: '../board' },
    { ...definition, heightMm: { top: NaN, bottom: 5 } },
    { ...definition, heightMm: { top: Infinity, bottom: 5 } },
    { ...definition, holes: [{ id: 'h', position: [0, 0], diameterMm: -1, keepoutMm: 0 }] },
    { ...definition, keepouts: [{ id: 'k', min: [0, 1], max: [0, 0] }] },
    { ...definition, placements: new Array(257).fill({}) },
    { ...definition, holes: new Array(129).fill({}) },
    {
      ...definition,
      placements: [{ id: 'p', productId: '../../bad', position: [0, 0], rotation: 0, locked: true, bindings: [] }],
    },
  ])('refuses malformed or unbounded data without coercion: %j', (value) => {
    expect(validBoardDefinition(value)).toBe(false);
  });

  it('rejects duplicate saved identities before serialization or placement', () => {
    const hole = { id: 'h', position: [0, 0] as [number, number], diameterMm: 3.2, keepoutMm: 2 };
    const scene = sceneOf([box('board', [0, 0, 0], [60, 1.6, 40], 5)], []);

    scene.project.electronicsBoard = { ...definition, holes: [hole, hole] };
    expect(() => projectBoard(scene)).toThrow('Repair the board definition');
  });

  it.each([
    { dimensions: { width: NaN, height: 1.6, depth: 40 } },
    { dimensions: { width: -1, height: 1.6, depth: 40 } },
    { dimensions: { width: 60, height: 0, depth: 40 } },
    { rotation: [0, Infinity, 0] as [number, number, number] },
    { deformers: { bendDeg: 20 } },
    { edges: { mm: 3, kind: 'fillet' as const } },
  ])('keeps unsupported board geometry unresolved: %j', (patch) => {
    const part = { ...box('board', [0, 0, 0], [60, 1.6, 40], 5), ...patch };

    expect(validBoardPart(part)).toBe(false);
    expect(
      projectBoard({
        parts: [part],
        project: { ...sceneOf([], []).project, electronicsBoard: definition },
      }).requirements.map((item) => item.code),
    ).toContain('board-geometry');
  });
});
