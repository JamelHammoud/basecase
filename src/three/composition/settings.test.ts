import { expect, it } from 'vitest';
import { DEFAULT_PROJECT } from '../../types/robotics';
import { decodeSceneFile, encodeSceneFile, sharedScene } from '../../utils/sceneFile';
import { sceneJson } from '../../utils/sceneJson';
import { defaultComposition, readComposition, validComposition } from './settings';

it('retains deterministic composition through ordinary and portable project persistence', async () => {
  const rendering = { ...defaultComposition(), width: 1920, height: 1080, rotation: 137, transparent: true };
  const project = { ...DEFAULT_PROJECT, rendering };
  const scene = sharedScene({ name: 'Finished arm', globalGoal: '', parts: [], project });
  const reopened = await decodeSceneFile(await encodeSceneFile(scene));
  const ordinary = JSON.parse(await sceneJson({ name: scene.name, parts: [], project }));

  expect(readComposition(reopened.project?.rendering)).toEqual(rendering);
  expect(ordinary.project.rendering).toEqual(rendering);
  expect(readComposition(undefined)).toEqual(defaultComposition());
});

it('bounds resolution, lighting and framing before allocating rendering resources', () => {
  const good = defaultComposition();

  expect(validComposition(good)).toBe(true);
  expect(validComposition({ ...good, width: 4096, height: 2048 })).toBe(true);

  for (const patch of [
    { width: 4097 },
    { width: 4096, height: 4096 },
    { height: 0 },
    { height: 1.5 },
    { lighting: Infinity },
    { exposure: -1 },
    { background: 'url(https://example.com)' },
    { rotation: NaN },
    { view: { ...good.view, position: [0, 0, NaN] } },
    { view: { ...good.view, target: good.view.position } },
    { view: { ...good.view, hfovDeg: 0 } },
  ]) {
    expect(validComposition({ ...good, ...patch })).toBe(false);
    expect(readComposition({ ...good, ...patch })).toEqual(good);
  }
});
