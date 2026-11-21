import { prepareBoardExport } from './boardExportPreparation';
import { expect, it } from 'vitest';
import { electricalScenes } from './electricalFixtures';
import { defineBoard } from './boardDefinition';
import { electricalPackage } from './electricalPackage';
import { importRoutedSource, routingInput } from './boardRoutedSource';
import { decodeSceneFile, encodeSceneFile, sharedScene } from '../utils/sceneFile';
import { docFromParts, pushHistory, trackedOf, travelProject } from '../workspace/docHistory';

it('retains exact routed copper and manufacturing inputs through ordinary scene persistence and history', async () => {
  const { scene } = electricalScenes().find((entry) => entry.name === 'dual-bus-arm')!;
  const { board, part } = defineBoard(scene, 'board');

  board.fabrication = { source: 'https://example.com/original', clearanceMm: 0.1, trackWidthMm: 0.2, drillMm: 0.2 };

  const input = { parts: [...scene.parts, part], project: { ...scene.project, electronicsBoard: board } };
  const base = await electricalPackage(input);
  const pcb = base.files['robot.kicad_pcb'].replace(
    /\)\s*$/,
    '(segment (start 0 0) (end 1 0) (width 0.25) (layer "F.Cu") (net 1)))',
  );
  const routed = await importRoutedSource({ input, bytes: new TextEncoder().encode(pcb) });

  routed.routed!.rules = { source: 'https://example.com/process', clearanceMm: 0.2, trackWidthMm: 0.25, drillMm: 0.3 };

  const changed = { ...input, project: { ...input.project, electronicsBoard: routed } };
  const bytes = await encodeSceneFile(sharedScene({ ...changed, name: 'Routed', globalGoal: '', annotations: [] }));
  const reopened = await decodeSceneFile(bytes);

  expect(reopened.project!.electronicsBoard).toEqual(routed);
  expect(routed.routed!.pcb).toBe(pcb);
  expect((await electricalPackage(routingInput(changed))).sourceFingerprint).toBe(base.sourceFingerprint);

  const history = pushHistory(docFromParts(input.parts), input.parts, trackedOf(input.project));
  const undo = travelProject(history, changed.project, { direction: 'undo' })!;
  const redo = travelProject(undo.doc, undo.project, { direction: 'redo' })!;

  expect(undo.project.electronicsBoard?.routed).toBeUndefined();
  expect(redo.project.electronicsBoard?.routed).toEqual(routed.routed);
  expect((await electricalPackage(changed)).files['robot.kicad_pcb']).toBe(pcb);
  expect((await electricalPackage(changed)).bytes).toEqual((await electricalPackage(changed)).bytes);
  expect((await importRoutedSource({ input: changed, bytes: new TextEncoder().encode(pcb) })).routed?.rules).toEqual(
    routed.routed!.rules,
  );
});

it('refuses broken UTF-8 without replacing bytes', async () => {
  await expect(
    importRoutedSource({ input: electricalScenes()[0].scene, bytes: new Uint8Array([0xff]) }),
  ).rejects.toThrow();
});

it.each(electricalScenes())(
  'retains exact supported identities and unresolved requirements after importing and reopening $name',
  async ({ scene, name }) => {
    const { board, part } = defineBoard(scene, 'board');
    const input = { parts: [...scene.parts, part], project: { ...scene.project, electronicsBoard: board } };
    const base = await electricalPackage(input);
    const imported = await importRoutedSource({
      input,
      bytes: new TextEncoder().encode(base.files['robot.kicad_pcb']),
    });
    const changed = { ...input, project: { ...input.project, electronicsBoard: imported } };
    const bytes = await encodeSceneFile(sharedScene({ ...changed, name, globalGoal: '', annotations: [] }));
    const reopened = await decodeSceneFile(bytes);
    const exported = await electricalPackage({ parts: reopened.parts, project: reopened.project! });

    expect(exported.files['robot.kicad_pcb']).toBe(base.files['robot.kicad_pcb']);
    expect(exported.sourceFingerprint).toBe(base.sourceFingerprint);
    expect(JSON.parse(exported.files['placement.json']).terminals).toEqual(
      JSON.parse(base.files['placement.json']).terminals,
    );
    expect(JSON.parse(exported.files['requirements.json']).projection.requirements).toEqual(
      JSON.parse(base.files['requirements.json']).projection.requirements,
    );
    expect(JSON.parse(exported.files['requirements.json']).projection.requirements.length).toBeGreaterThan(0);
  },
);

it('keeps raw copper after a supply edit while refusing its stale fabrication evidence', async () => {
  const scene = electricalScenes().find((entry) => entry.name === 'dual-bus-arm')!.scene;
  const { board, part } = defineBoard(scene, 'board');
  const input = { parts: [...scene.parts, part], project: { ...scene.project, electronicsBoard: board } };
  const base = await electricalPackage(input);
  const imported = await importRoutedSource({ input, bytes: new TextEncoder().encode(base.files['robot.kicad_pcb']) });
  const changed = {
    ...input,
    project: { ...input.project, electronicsBoard: imported, tether: { volts: 48, amps: 0.5 } },
  };
  const prepared = await prepareBoardExport(changed);

  expect(prepared.request).toBeNull();
  expect(prepared.files['robot.kicad_pcb']).toBe(base.files['robot.kicad_pcb']);
  expect(
    JSON.parse(prepared.files['requirements.json']).board.requirements.some(
      (item: { code: string }) => item.code === 'board-stale-routing',
    ),
  ).toBe(true);
  expect(Object.keys(prepared.files).some((name) => name.startsWith('fabrication/'))).toBe(false);
});

it('retains a UTF-8 byte-order mark as part of the content-addressed source', async () => {
  const scene = electricalScenes().find((entry) => entry.name === 'dual-bus-arm')!.scene;
  const { board, part } = defineBoard(scene, 'board');
  const input = { parts: [...scene.parts, part], project: { ...scene.project, electronicsBoard: board } };
  const base = await electricalPackage(input);
  const bytes = new TextEncoder().encode(`\uFEFF${base.files['robot.kicad_pcb']}`);
  const imported = await importRoutedSource({ input, bytes });

  expect(new TextEncoder().encode(imported.routed!.pcb)).toEqual(bytes);
});
