import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { defineBoard } from '../../src/wiring/boardDefinition';
import { electricalPackage } from '../../src/wiring/electricalPackage';
import type { WiringFixture } from '../../src/wiring/fixtures';
import { projectBoard } from '../../src/wiring/boardProjection';
import { boardPcb } from '../../src/wiring/boardPcb';
import { mountedBoardParts } from '../../src/wiring/boardMounts';
import { boardComponents } from '../../src/wiring/boardComponents';
import { reconcileRoutedBoard } from '../../src/wiring/boardReconcile.mjs';

export async function boardFixtureInput(
  scene: WiringFixture,
  configure?: (definition: ReturnType<typeof defineBoard>) => void,
) {
  const definition = defineBoard(scene, 'board');

  configure?.(definition);

  const { part, board, hardwareParts } = definition;
  const ids = [
    ...new Set(
      [...scene.parts, ...boardComponents(part, board)].flatMap((item) => (item.componentId ? [item.componentId] : [])),
    ),
  ];
  const meshes = await Promise.all(
    ids.map(async (id) => {
      const bytes = await readFile(path.join('public', 'parts', `${id}.glb`));

      return [id, bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)] as const;
    }),
  );
  const input = {
    parts: mountedBoardParts([...scene.parts, part, ...hardwareParts], board),
    project: { ...scene.project, electronicsBoard: board },
    meshFiles: Object.fromEntries(meshes),
  };

  return { input, board };
}

export async function boardFixture(
  scene: WiringFixture,
  configure?: (definition: ReturnType<typeof defineBoard>) => void,
) {
  const { input, board } = await boardFixtureInput(scene, configure);
  const made = await electricalPackage(input);
  const reopened = await electricalPackage({
    ...JSON.parse(JSON.stringify({ parts: input.parts, project: input.project })),
    meshFiles: input.meshFiles,
  });

  const transforms = (['top', 'bottom'] as const).flatMap((side) =>
    ([0, 90, 180, 270] as const).map((rotation) => {
      const variant = {
        ...board,
        side,
        placements: board.placements.map((placement) => ({ ...placement, rotation })),
      };
      const projection = projectBoard({ ...input, project: { ...input.project, electronicsBoard: variant } });

      return { side, rotation, pcb: boardPcb(projection)['robot.kicad_pcb'] };
    }),
  );

  return {
    ...made,
    definition: board,
    snapshot: input,
    reopened: reopened.bytes,
    transforms,
    reconcile: (imported: string) =>
      reconcileRoutedBoard({
        expected: made.files['robot.kicad_pcb'],
        imported,
        sourceFingerprint: made.sourceFingerprint,
      }),
  };
}
