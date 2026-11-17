import { nativeKitFixture } from '../../src/kit/nativeKit.fixtures';
import { finishBoardExport } from '../../src/wiring/boardExportPreparation';
import type { BoardNativeResult } from '../../src/wiring/boardRoutingTypes';
import { electricalScenes } from '../../src/wiring/electricalFixtures';
import { boardFixture } from './boardFixtures';
import { kiCadChild, kiCadChildren, kiCadNumber, readKiCadBoard } from '../../src/wiring/boardKiCad.mjs';
import { importRoutedSource } from '../../src/wiring/boardRoutedSource';
import { prepareBoardExport } from '../../src/wiring/boardExportPreparation';

export const FIXTURE_RULES = {
  source: 'https://jlcpcb.com/capabilities/pcb-capabilities',
  clearanceMm: 0.2,
  trackWidthMm: 0.25,
  drillMm: 0.3,
};

const stackup =
  '(stackup (layer "F.Cu" (type "copper") (thickness 0.035)) (layer "dielectric 1" (type "core") (thickness 1.53) (material "FR4") (epsilon_r 4.5) (loss_tangent 0.02)) (layer "B.Cu" (type "copper") (thickness 0.035)))';

export function routeFixtureBoard(pcb: string) {
  const parsed = readKiCadBoard(pcb);
  const groups = new Map<string, [number, number][]>();

  for (const footprint of kiCadChildren(parsed, 'footprint')) {
    const at = kiCadChild(footprint, 'at');

    for (const pad of kiCadChildren(footprint, 'pad').filter((node) => node[2] === 'thru_hole')) {
      const net = kiCadChild(pad, 'net');
      const local = kiCadChild(pad, 'at');
      const id = String(net[1]);
      const point: [number, number] = [
        kiCadNumber(at[1]) + kiCadNumber(local[1]),
        kiCadNumber(at[2]) + kiCadNumber(local[2]),
      ];

      groups.set(id, [...(groups.get(id) ?? []), point]);
    }
  }

  const segments = [...groups].flatMap(([net, points]) =>
    points.slice(1).map((end, i) => {
      const start = points[i];

      if (start[0] !== end[0]) throw new Error('Fixture terminals need aligned routing columns.');

      return `(segment (start ${start.join(' ')}) (end ${end.join(' ')}) (width 0.25) (layer "B.Cu") (net ${net}))`;
    }),
  );

  return pcb
    .replace('(setup (pad_to_mask_clearance 0))', `(setup (pad_to_mask_clearance 0) ${stackup})`)
    .replace(/\)\s*$/, `${segments.join('\n')})\n`);
}

export async function completedRoutedFixture() {
  const scene = electricalScenes().find((entry) => entry.name === 'dual-bus-arm')!.scene;
  const base = await boardFixture(scene, ({ board, part }) => {
    part.position = [0, 120, 0];
    board.placements = board.placements.map((placement, i) => ({
      ...placement,
      position: [-10, -12 + i * 24],
      rotation: 0,
      locked: true,
      unplaced: false,
    }));
  });
  const pcb = routeFixtureBoard(base.files['robot.kicad_pcb']);
  const board = await importRoutedSource({ input: base.snapshot, bytes: new TextEncoder().encode(pcb) });

  board.routed!.rules = FIXTURE_RULES;

  const input = { ...base.snapshot, project: { ...base.snapshot.project, electronicsBoard: board } };
  const prepared = await prepareBoardExport(input);

  return {
    input,
    base,
    pcb,
    prepared,
    kit: (result: BoardNativeResult) => nativeKitFixture(input, prepared, result),
    finish: (result: BoardNativeResult) => finishBoardExport({ prepared, result }),
  };
}
