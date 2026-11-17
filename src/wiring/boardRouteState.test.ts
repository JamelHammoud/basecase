import { expect, it } from 'vitest';
import { defineBoard } from './boardDefinition';
import { electricalScenes } from './electricalFixtures';
import { prepareBoardRoute } from './boardRoutePreparation';
import { boardRouteFindings } from './boardRouteFindings';
import { validBoardDefinition } from './boardValidation';
import { boardGeometryKey } from './boardGeometry';
import { encodeSceneFile, decodeSceneFile } from '../utils/sceneFile';

const fabrication = { source: 'https://example.com/process', clearanceMm: 0.2, trackWidthMm: 0.25, drillMm: 0.3 };
const routing = {
  source: 'https://example.com/design',
  trackWidthMm: 0.4,
  clearanceMm: 0.25,
  viaDiameterMm: 0.8,
  viaDrillMm: 0.4,
  copperMm: 0.035,
  dielectricMaterial: 'FR4',
  epsilonR: 4.5,
  lossTangent: 0.02,
  special: '',
};
const scene = electricalScenes().find((entry) => entry.name === 'dual-bus-arm')!.scene;

it('retains pre-route manufacturing declarations through ordinary scene encoding without changing geometry identity', async () => {
  const definition = defineBoard(scene, 'board');
  const parts = [...scene.parts, definition.part, ...definition.hardwareParts];
  const board = { ...definition.board, fabrication, routing };
  const project = { ...scene.project, electronicsBoard: board };
  const bytes = await encodeSceneFile({ parts, project, name: 'Board', globalGoal: '', annotations: [] });
  const decoded = await decodeSceneFile(bytes);

  expect(decoded.project?.electronicsBoard).toEqual(board);
  expect(validBoardDefinition(board)).toBe(true);
  expect(boardGeometryKey({ parts, project })).toBe(
    boardGeometryKey({ parts, project: { ...project, electronicsBoard: definition.board } }),
  );
});

it('keeps special requirements unresolved even when a board has imported copper', () => {
  const { board } = defineBoard(scene, 'board');
  const withRequirements = { ...board, fabrication, routing: { ...routing, special: '100 ohm differential pair' } };

  expect(boardRouteFindings(withRequirements).map((item) => item.code)).toEqual(['board-route-special']);
  expect(
    boardRouteFindings({
      ...withRequirements,
      routed: {
        schema: 1,
        hash: 'a'.repeat(64),
        sourceFingerprint: 'b'.repeat(64),
        pcb: '(kicad_pcb)',
        rules: fabrication,
      },
    }).map((item) => item.code),
  ).toEqual(['board-route-special']);
});

it('keeps pre-route fabrication inputs usable for the existing manual import workflow', () => {
  const { board } = defineBoard(scene, 'board');

  expect(boardRouteFindings({ ...board, fabrication })).toEqual([]);
});

it('refuses routing an existing routed source before geometry preparation or replacement', async () => {
  const { board, part } = defineBoard(scene, 'board');
  const routed = {
    ...board,
    fabrication,
    routing,
    routed: {
      schema: 1 as const,
      hash: 'a'.repeat(64),
      sourceFingerprint: 'b'.repeat(64),
      pcb: '(kicad_pcb)',
      rules: fabrication,
    },
  };
  const input = { parts: [...scene.parts, part], project: { ...scene.project, electronicsBoard: routed } };

  await expect(prepareBoardRoute(input)).rejects.toThrow('Existing copper');
  expect(input.project.electronicsBoard).toBe(routed);
});
