import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { electricalPackage } from './electricalPackage';
import { electricalScenes } from './electricalFixtures';
import type { ElectronicsBoard } from './boardTypes';
import { box } from '../sim/fixtures/parts';
import { electricalSnapshot } from './electricalSnapshot';
import { decodeSceneFile, encodeSceneFile, sharedScene } from '../utils/sceneFile';

function fixture() {
  const scene = electricalScenes().find((entry) => entry.name === 'dual-bus-arm')!.scene;
  const board: ElectronicsBoard = {
    schema: 1,
    partId: 'board',
    outline: 'rectangle',
    side: 'top',
    heightMm: { top: 30, bottom: 5 },
    edgeClearanceMm: 1,
    holes: [{ id: 'h1', position: [-20, -15], diameterMm: 3.2, keepoutMm: 2 }],
    keepouts: [],
    placements: [1, 2].map((i) => ({
      id: `xl${i}`,
      productId: 'jst-b3b-eh-a',
      position: [0, i * 10 - 15],
      rotation: 0,
      locked: true,
      bindings: ['1', '2', '3'].map((pin) => ({ pad: pin, partId: `xl${i}`, port: 'bus-in', pin })),
    })),
  };

  return {
    ...scene,
    parts: [...scene.parts, box('board', [0, 50, 0], [60, 1.6, 40], 5)],
    project: { ...scene.project, electronicsBoard: board },
  };
}

describe('editable board package', () => {
  it('retains an unresolved board whose host was removed without inventing a PCB outline', async () => {
    const input = fixture();

    input.parts = input.parts.filter((part) => part.id !== 'board');

    const result = await electricalPackage(input);
    const report = JSON.parse(result.files['requirements.json']);

    expect(report.board.board.partId).toBe('board');
    expect(report.board.requirements.some((item: { code: string }) => item.code === 'board-geometry')).toBe(true);
    expect(result.files['robot.kicad_pcb']).toBeUndefined();
    expect(result.files['source.json']).toContain('electronicsBoard');
  });

  it('keeps complete endpoint evidence while adding only checked PCB pads to the schematic', async () => {
    const input = fixture();
    const result = await electricalPackage(electricalSnapshot(input));
    const report = JSON.parse(result.files['requirements.json']);
    const pcb = result.files['robot.kicad_pcb'];

    expect(pcb).toContain('(kicad_pcb');
    expect(pcb).toContain('(thickness 1.6)');
    expect(pcb).toContain('Edge.Cuts');
    expect(pcb).toContain('(drill 3.2)');
    expect(pcb).toContain('BC_xl1');
    expect(pcb).toContain('BC_xl2');
    expect(pcb).not.toMatch(/\(segment|\(zone|\(via/);
    expect(result.files['fp-lib-table']).toContain('${KIPRJMOD}/Robot.pretty');
    expect(result.files['Robot.pretty/JST_B3B_EH_A_TypeA.kicad_mod']).toContain('(pad "3"');
    expect(report.board.terminals).toHaveLength(6);
    expect(report.board.requirements.some((item: { code: string }) => item.code === 'board-unrouted')).toBe(true);
    expect(report.projection.requirements.length).toBeGreaterThan(0);
    expect(report.projection.electricalVerdict).toBe('not-established');
    expect(result.sourceFingerprint).toBe(createHash('sha256').update(result.files['source.json']).digest('hex'));
  });

  it('preserves board identities, constraints and exact archive bytes across ordinary save and reopen', async () => {
    const scene = fixture();
    const before = await electricalPackage(electricalSnapshot(scene));
    const bytes = await encodeSceneFile(sharedScene({ ...scene, name: 'Board', globalGoal: '', annotations: [] }));
    const saved = await decodeSceneFile(bytes);
    const after = await electricalPackage(electricalSnapshot({ parts: saved.parts, project: saved.project! }));

    expect(after.bytes).toEqual(before.bytes);
    scene.project.electronicsBoard.placements[0].position[0]++;
    expect((await electricalPackage(electricalSnapshot(scene))).sourceFingerprint).not.toBe(before.sourceFingerprint);
  });

  it('preserves unsupported mappings and emits no invented footprint for them', async () => {
    const input = fixture();

    input.project.electronicsBoard.placements[0].productId = 'unproven';

    const result = await electricalPackage(input);
    const report = JSON.parse(result.files['requirements.json']);

    expect(report.board.board.placements).toHaveLength(2);
    expect(report.board.requirements.some((item: { code: string }) => item.code === 'board-mapping')).toBe(true);
    expect(result.files['robot.kicad_pcb']).not.toContain('BC_xl1');
    expect(result.files['robot.kicad_pcb']).toContain('BC_xl2');
  });
});
