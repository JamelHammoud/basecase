import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { electricalScenes } from '../wiring/electricalFixtures';
import { defineBoard } from '../wiring/boardDefinition';
import { useSceneDocument, type SceneDocument } from '../workspace/useSceneDocument';
import { finishAppearance } from './model';

it('applies two finishes through document history without moving a board’s modules or replacing joints', () => {
  const { scene } = electricalScenes().find((entry) => entry.name === 'battery-rover')!;
  const { part, board } = defineBoard(scene, 'appearance-board');
  const parts = [...scene.parts, part];
  const project = { ...scene.project, electronicsBoard: board };
  const holder: { current?: SceneDocument } = {};
  const Probe = () => {
    holder.current = useSceneDocument({
      sceneId: 'appearance',
      sceneName: 'Board',
      parts,
      project,
      globalGoal: '',
      annotations: [],
    });

    return null;
  };

  renderToStaticMarkup(createElement(Probe));

  const document = holder.current!;
  const selected = new Set([part.id, parts[0].id]);

  document.commitParts((before) =>
    before.map((part) =>
      selected.has(part.id) ? { ...part, appearance: finishAppearance('paint', part.color) } : part,
    ),
  );

  const finished = document.partsRef.current;

  expect(document.docRef.current.past).toHaveLength(1);
  expect(document.projectRef.current.joints).toBe(project.joints);
  expect(finished.map((part) => part.position)).toEqual(parts.map((part) => part.position));
  expect(finished.map((part) => part.dimensions)).toEqual(parts.map((part) => part.dimensions));

  for (let index = 0; index < parts.length; index++) {
    if (!selected.has(parts[index].id)) expect(finished[index]).toBe(parts[index]);
  }

  document.travel({ direction: 'undo' }, () => {});
  expect(document.partsRef.current).toBe(parts);
  document.travel({ direction: 'redo' }, () => {});
  expect(document.partsRef.current).toBe(finished);
});
