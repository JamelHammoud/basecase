import { expect, it } from 'vitest';
import { acceptBoardRoute } from './boardRouteAcceptance';
import { boardEvidenceKey, boardDigest } from './boardNativeContract.mjs';
import type { ElectronicsBoard } from './boardTypes';
import type { BoardNativeRequest, BoardNativeResult } from './boardRoutingTypes';

async function fixture() {
  const pcb = '(kicad_pcb)';
  const hash = await boardDigest(pcb);
  const request: BoardNativeRequest = {
    id: 'route',
    pcb,
    boardHash: hash,
    expected: pcb,
    schematic: '',
    footprints: {},
    sourceFingerprint: 'a'.repeat(64),
    geometryFingerprint: 'b'.repeat(64),
    rules: null,
    mechanicalIssues: [],
  };
  const board: ElectronicsBoard = {
    schema: 1,
    partId: 'board',
    outline: 'rectangle',
    side: 'top',
    heightMm: { top: 30, bottom: 10 },
    edgeClearanceMm: 1,
    holes: [],
    keepouts: [],
    placements: [],
    routed: { schema: 1, pcb, hash, sourceFingerprint: request.sourceFingerprint, rules: null },
  };
  const result: BoardNativeResult = {
    key: await boardEvidenceKey(request),
    version: '9.0.6',
    issues: [],
    report: JSON.stringify({ kicad_version: '9.0.6', violations: [], unconnected_items: [], schematic_parity: [] }),
    files: {},
    metrics: { cliMs: 1, outputBytes: 0 },
  };

  return { board, request, result };
}

it('accepts current native evidence immutably and excludes fabrication payload from the scene record', async () => {
  const input = await fixture();
  const board = await acceptBoardRoute(input);

  expect(board).not.toBe(input.board);
  expect(input.board.routed?.evidence).toBeUndefined();
  expect(board.routed?.evidence?.key).toBe(input.result.key);
  expect(board.routed?.evidence).not.toHaveProperty('files');
});

it.each([
  { version: null },
  { version: '9.0.7' },
  { report: null },
  { report: '{}' },
  { report: JSON.stringify({ kicad_version: '9.0.6', violations: [], unconnected_items: [{}], schematic_parity: [] }) },
  { issues: ['board-drc'] },
  { key: 'c'.repeat(64) },
])('refuses absent, stale, incompatible or failing evidence without changing the board', async (patch) => {
  const input = await fixture();
  const before = structuredClone(input.board);

  await expect(acceptBoardRoute({ ...input, result: { ...input.result, ...patch } })).rejects.toThrow();
  expect(input.board).toEqual(before);
});

it('refuses a source record whose declared source binding differs from the validated request', async () => {
  const input = await fixture();
  const board = { ...input.board, routed: { ...input.board.routed!, sourceFingerprint: 'd'.repeat(64) } };

  await expect(acceptBoardRoute({ ...input, board })).rejects.toThrow();
  expect(board.routed.evidence).toBeUndefined();
});
