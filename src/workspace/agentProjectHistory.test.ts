import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { useSceneDocument, type SceneDocument } from './useSceneDocument';
import { specToPart } from '../agent/agentScene';
import { DEFAULT_PROJECT, type ProjectSettings } from '../types/robotics';

it('keeps project authoring on the same ordered undo timeline as manual part edits', () => {
  const parts = [specToPart({ id: 'base', shape: 'box' }), specToPart({ id: 'arm', shape: 'box' })];
  let doc: SceneDocument | undefined;
  const Host = () => {
    doc = useSceneDocument({
      sceneId: 'agent-history',
      sceneName: 'Arm',
      globalGoal: '',
      parts,
      annotations: [],
      project: DEFAULT_PROJECT,
    });

    return null;
  };

  renderToStaticMarkup(createElement(Host));

  const authoring: ProjectSettings = {
    ...DEFAULT_PROJECT,
    budgetUsd: 400,
    joints: [
      {
        id: 'hinge',
        name: 'Hinge',
        type: 'revolute',
        actuation: 'passive',
        parent: ['base'],
        child: ['arm'],
        origin: [0, 10, 0],
        axis: [1, 0, 0],
        range: [-30, 30],
      },
    ],
  };

  doc!.commitSettings(authoring);
  doc!.commitParts((current) =>
    current.map((part) => (part.id === 'arm' ? { ...part, name: 'Manual arm edit' } : part)),
  );
  doc!.travel({ direction: 'undo' }, () => {});
  expect(doc!.partsRef.current).toEqual(parts);
  expect(doc!.projectRef.current.joints).toEqual(authoring.joints);
  doc!.travel({ direction: 'undo' }, () => {});
  expect(doc!.projectRef.current.joints).toBeUndefined();
  expect(doc!.projectRef.current.budgetUsd).toBe(DEFAULT_PROJECT.budgetUsd);
  doc!.travel({ direction: 'redo' }, () => {});
  doc!.travel({ direction: 'redo' }, () => {});
  expect(doc!.projectRef.current.joints).toEqual(authoring.joints);
  expect(doc!.partsRef.current[1].name).toBe('Manual arm edit');
});
