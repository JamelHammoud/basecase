import { expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { useContactSettings } from '../sim/useSceneModel';
import type { SimInputs } from '../sim/useSimulation';
import { selfContactArmInput } from '../sim/fixtures/selfContactArm';
import { decodeSceneFile, encodeSceneFile } from '../utils/sceneFile';
import { docFromParts, pushHistory, trackedOf, travelProject } from './docHistory';

it('authors the setting by the robot name exposed to the agent while storing its stable key', () => {
  const scene = selfContactArmInput(false);
  const input: SimInputs = { ...scene, pose: undefined, viewportRef: { current: null }, restDeltas: new Map() };
  const inputsRef = { current: input };
  const stop = vi.fn();
  const noteContactEdit = vi.fn();
  let settings: ReturnType<typeof useContactSettings> | undefined;

  function Harness() {
    settings = useContactSettings({ input, inputsRef, stop, noteContactEdit });

    return null;
  }

  renderToString(createElement(Harness));
  settings!.configureSelfContact(scene.rig.robots[0].name, { enabled: true });
  expect(inputsRef.current.project.selfContact?.[scene.rig.robots[0].key]?.enabled).toBe(true);
  expect(stop).toHaveBeenCalledOnce();
  expect(noteContactEdit).toHaveBeenCalledOnce();
  expect(() => settings!.configureSelfContact('missing robot', { enabled: true })).toThrow('Choose a robot');
});

it('restores contact configuration through undo, redo and actual scene-file bytes', async () => {
  const input = selfContactArmInput(false);
  const key = input.rig.robots[0].key;
  const before = input.project;
  const after = {
    ...before,
    joints: input.rig.joints,
    selfContact: { [key]: { enabled: true, exclusions: [['base', 'tip'] as [string, string]] } },
  };
  const doc = pushHistory(docFromParts(input.parts), input.parts, trackedOf(before));
  const undone = travelProject(doc, after, { direction: 'undo' })!;
  const redone = travelProject(undone.doc, undone.project, { direction: 'redo' })!;
  const bytes = await encodeSceneFile({
    name: 'Folding arm',
    globalGoal: '',
    parts: input.parts,
    annotations: [],
    project: redone.project,
  });
  const reopened = await decodeSceneFile(bytes);

  expect(undone.project.selfContact).toEqual(before.selfContact);
  expect(redone.project.selfContact).toEqual(after.selfContact);
  expect(reopened.project?.selfContact).toEqual(after.selfContact);
});
