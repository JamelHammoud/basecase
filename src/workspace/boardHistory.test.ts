import { expect, it } from 'vitest';
import { defineBoard } from '../wiring/boardDefinition';
import { electricalScenes } from '../wiring/electricalFixtures';
import { docFromParts, pushHistory, trackedOf, travelProject } from './docHistory';

it('restores board definition, local locks, dimensions and module parts through ordinary undo and redo', () => {
  const scene = electricalScenes().find((entry) => entry.name === 'battery-rover')!.scene;
  const { part, board } = defineBoard(scene, 'board');
  const project = { ...scene.project, electronicsBoard: board };
  const inserted = pushHistory(docFromParts(scene.parts), [...scene.parts, part], trackedOf(scene.project));
  const undo = travelProject(inserted, project, { direction: 'undo' })!;

  expect(undo.project.electronicsBoard).toBeUndefined();
  expect(undo.doc.parts).toEqual(scene.parts);

  const redo = travelProject(undo.doc, undo.project, { direction: 'redo' })!;

  expect(redo.project.electronicsBoard).toEqual(board);
  expect(redo.doc.parts).toEqual(inserted.parts);
});
