import { component } from '../../src/wiring/fixtures';
import { componentSize } from '../../src/data/components';
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

  fixtures.push(await denseRoutingFixture());

  return fixtures;
}

export { acceptBoardRoute, finishBoardExport, encodeSceneFile, decodeSceneFile };

async function denseRoutingFixture() {
  const original = electricalScenes().find((entry) => entry.name === 'dual-bus-arm')!.scene;
  const added = [
    component('third', 'robotis-u2d2'),
    component('xl3', 'dynamixel-xl330-m288'),
    component('xl4', 'dynamixel-xl330-m288'),
  ].map((part, i) => ({
    ...part,
    dimensions: componentSize(part.componentId!),
    position: [-180, 50, i * 50] as [number, number, number],
  }));
  const scene = { ...original, parts: [...original.parts, ...added] };
  const base = await boardFixture(scene, ({ board, part }) => {
    part.position = [0, 500, 0];
    board.heightMm = { top: 30, bottom: 30 };
    board.placements = ['', 'repeat_', 'repeat2_', 'repeat3_']
      .flatMap((prefix) => board.placements.map((placement) => ({ ...placement, id: `${prefix}${placement.id}` })))
      .map((placement, i) => ({
        ...placement,
        position: [
          -30 + (((i * 5) % 16) % 4) * 20 + Math.floor(((i * 5) % 16) / 4) * 0.37,
          -30 + Math.floor(((i * 5) % 16) / 4) * 20,
        ],
        rotation: ((i % 4) * 90) as 0 | 90 | 180 | 270,
        locked: true,
        unplaced: false,
      }));
  });
  const board = { ...base.definition, fabrication: FIXTURE_RULES, routing: ROUTING_PLAN };
  const input = { ...base.snapshot, project: { ...base.snapshot.project, electronicsBoard: board } };

  return {
    name: 'dense-dual-domain',
    base,
    expectedOutcome: 'routed',
    input,
    expected: null,
    prepare: () => prepareBoardRoute(input),
    finish: async (pcb: string, provenance: NonNullable<typeof board.routed>['provenance']) => {
      const imported = await importRoutedText({ input, pcb });

      imported.routed!.provenance = provenance;

      return {
        board: imported,
        prepared: await prepareBoardExport({ ...input, project: { ...input.project, electronicsBoard: imported } }),
      };
    },
  };
}
