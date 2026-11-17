import { electricalScenes } from '../../src/wiring/electricalFixtures';
import { boardFixture } from './boardFixtures';
import { prepareBoardRoute } from '../../src/wiring/boardRoutePreparation';
import { importRoutedText } from '../../src/wiring/boardRoutedSource';
import { prepareBoardExport, finishBoardExport } from '../../src/wiring/boardExportPreparation';
import { acceptBoardRoute } from '../../src/wiring/boardRouteAcceptance';
import { expectedConnections } from './expected';
import { FIXTURE_RULES } from './routedFixtures';
import { encodeSceneFile, decodeSceneFile } from '../../src/utils/sceneFile';

export const ROUTING_PLAN = {
  source: 'https://example.com/declared-carrier-design',
  trackWidthMm: 0.25,
  clearanceMm: 0.2,
  viaDiameterMm: 0.8002,
  viaDrillMm: 0.4001,
  copperMm: 0.035,
  dielectricMaterial: 'FR4',
  epsilonR: 4.5,
  lossTangent: 0.02,
  special: '',
};

export async function routingFixtures() {
  const fixtures = [];

  for (const [index, entry] of electricalScenes().entries()) {
    const base = await boardFixture(entry.scene, ({ board, part }) => {
      part.position = [0, 500, 0];
      board.side = index % 2 ? 'bottom' : 'top';
      board.heightMm = { top: 30, bottom: 30 };
      board.placements = board.placements.map((placement, i) => ({
        ...placement,
        position: [0, i * 24 - 12],
        rotation: ((index % 4) * 90) as 0 | 90 | 180 | 270,
        locked: true,
        unplaced: false,
      }));
    });
    const board = { ...base.definition, fabrication: FIXTURE_RULES, routing: ROUTING_PLAN };
    const input = { ...base.snapshot, project: { ...base.snapshot.project, electronicsBoard: board } };

    fixtures.push({
      name: entry.name,
      base,
      expectedOutcome: ['battery-rover', 'dual-bus-arm'].includes(entry.name) ? 'routed' : 'refused',
      input,
      expected: expectedConnections(entry.name, entry.scene),
      prepare: () => prepareBoardRoute(input),
      finish: async (pcb: string, provenance: NonNullable<typeof board.routed>['provenance']) => {
        const imported = await importRoutedText({ input, pcb });

        imported.routed!.provenance = provenance;

        return {
          board: imported,
          prepared: await prepareBoardExport({ ...input, project: { ...input.project, electronicsBoard: imported } }),
        };
      },
    });
  }

  return fixtures;
}

export { acceptBoardRoute, finishBoardExport, encodeSceneFile, decodeSceneFile };
