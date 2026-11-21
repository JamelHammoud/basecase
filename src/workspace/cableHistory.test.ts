import type { ProjectSettings } from '../types/robotics';
import { versionPart, versionScene } from './sceneVersions.fixtures';
import { danglingReferences, mergeDesigns } from './versionMerge';
import { expect, it } from 'vitest';
import { component, sceneOf } from '../wiring/fixtures';
import { editableNets, routeIdentity, updateRoute } from '../wiring/routeEditing';
import { decodeSceneFile, encodeSceneFile } from '../utils/sceneFile';
import { docFromParts, pushHistory, trackedOf, travelProject } from './docHistory';

it('restores complete stock and ordered anchors through scene history and actual scene-file bytes', async () => {
  const scene = sceneOf([component('adapter', 'robotis-u2d2'), component('servo', 'dynamixel-xl330-m288')], []);
  const identity = routeIdentity(editableNets(scene)[0])!;
  const anchors = [
    { partId: 'servo', position: [0, 30, 0] as [number, number, number] },
    { partId: 'adapter', position: [0, 40, 0] as [number, number, number] },
  ];
  const after = updateRoute(scene, identity, { supplyId: 'robot-cable-x3p', anchors });
  const doc = pushHistory(docFromParts(scene.parts), scene.parts, trackedOf(scene.project));
  const undone = travelProject(doc, after, { direction: 'undo' })!;
  const redone = travelProject(undone.doc, undone.project, { direction: 'redo' })!;
  const bytes = await encodeSceneFile({
    name: 'Cable arm',
    globalGoal: '',
    parts: scene.parts,
    annotations: [],
    project: redone.project,
  });
  const reopened = await decodeSceneFile(bytes);

  expect(undone.project.wiring).toBeUndefined();
  expect(redone.project.wiring).toEqual(after.wiring);
  expect(reopened.project?.wiring).toEqual(after.wiring);
  expect(reopened.project?.wiring?.[0].anchors).toEqual(anchors);
});

it('retains anchor-owner references when merging a route and reports an absent owner', () => {
  const scene = sceneOf([component('adapter', 'robotis-u2d2'), component('servo', 'dynamixel-xl330-m288')], []);
  const clip = versionPart('clip');
  const source = { ...scene, parts: [...scene.parts, clip] };
  const identity = routeIdentity(editableNets(source)[0])!;
  const project = updateRoute(source, identity, {
    supplyId: 'robot-cable-x3p',
    anchors: [{ partId: clip.id, position: [0, 30, 0] }],
  });
  const base = { ...versionScene(scene.parts), project: scene.project };
  const incoming = { ...versionScene(source.parts), project };
  const merged = mergeDesigns({ base, ours: base, theirs: incoming, selected: ['project:wiring'] });

  expect(merged.dangling).toEqual([]);
  expect(merged.required).toContain('part:clip');
  expect(merged.scene?.project.wiring).toEqual(project.wiring);
  expect(danglingReferences({ ...incoming, parts: scene.parts })).toContain('part:clip');
});

it('undoes and redoes every authored operation without losing stock, ownership or point order', () => {
  const scene = sceneOf(
    [component('adapter', 'waveshare-bus-servo-adapter-a'), component('servo', 'feetech-sts3215', 'c001')],
    [],
  );
  const identity = routeIdentity(editableNets(scene)[0])!;
  const first = { partId: 'adapter', position: [0, 80, 0] as [number, number, number] };
  const moved = { ...first, position: [0, 90, 0] as [number, number, number] };
  const second = { partId: 'servo', position: [0, 40, 0] as [number, number, number] };
  const declarations = [
    { ...identity, supplyId: 'waveshare-servo-cable-5264-900' },
    { ...identity, supplyId: 'waveshare-servo-cable-5264-900', anchors: [first] },
    { ...identity, supplyId: 'waveshare-servo-cable-5264-900', anchors: [moved] },
    { ...identity, supplyId: 'waveshare-servo-cable-5264-900', anchors: [moved, second] },
    { ...identity, supplyId: 'waveshare-servo-cable-5264-900', anchors: [second, moved] },
    { ...identity, supplyId: 'waveshare-servo-cable-5264-900', anchors: [moved] },
  ];
  let project: ProjectSettings = scene.project;
  let doc = docFromParts(scene.parts);

  for (const declaration of declarations) {
    const next = updateRoute({ ...scene, project }, identity, declaration);

    doc = pushHistory(doc, scene.parts, trackedOf(project));
    project = next;
  }

  expect(doc.past).toHaveLength(6);

  for (const expected of [
    ...declarations
      .slice(0, -1)
      .reverse()
      .map((entry) => [entry]),
    undefined,
  ]) {
    const result = travelProject(doc, project, { direction: 'undo' })!;

    doc = result.doc;
    project = result.project;
    expect(project.wiring).toEqual(expected);
  }

  for (const expected of declarations) {
    const result = travelProject(doc, project, { direction: 'redo' })!;

    doc = result.doc;
    project = result.project;
    expect(project.wiring).toEqual([expected]);
  }
});
