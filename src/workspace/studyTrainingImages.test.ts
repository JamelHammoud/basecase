import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import { visibilityDesign } from '../study/visibilityFixtures';
import { studyScene, studyFingerprint } from '../study/study';
import { buildRig } from '../utils/kinematics';
import { docFromParts, pushHistory, trackedOf, travelProject } from './docHistory';
import type { Simulation } from '../sim/useSimulation';
import { makeTrainingImages } from '../vision/trainingImagesClient';
import { trainingPlan } from '../vision/trainingPlan';
import { useTrainingImages, type TrainingImages } from './useTrainingImages';

vi.mock('../vision/trainingImagesClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../vision/trainingImagesClient')>()),
  makeTrainingImages: vi.fn(async () => ({ dataset: { id: 'images' }, frameSet: { id: 'frames' }, classCounts: {} })),
}));

it('applies camera and lens through ordinary scene history and sends them to existing training image generation', async () => {
  const base = visibilityDesign(0);
  const original = { ...base, triangles: {}, measures: {} };
  const edited = await studyScene(
    original,
    [
      {
        id: 'pose',
        kind: 'camera_pose',
        part: 'eye',
        values: [{ position: [-2.47, 210, 5.12], rotation: [90, 0, 0] }],
      },
      { id: 'lens', kind: 'camera_lens', part: 'eye', values: [{ model: 'fisheye', fovDeg: 180 }] },
    ],
    [0, 0],
  );
  const project = { ...edited.project, infillPct: 37 };
  const doc = pushHistory(docFromParts(base.parts), edited.parts, trackedOf(base.project));
  const undone = travelProject(doc, project, { direction: 'undo' })!;
  const redone = travelProject(undone.doc, undone.project, { direction: 'redo' })!;
  const result: { current?: TrainingImages } = {};

  expect(undone.doc.parts).toEqual(base.parts);
  expect(redone.doc.parts).toEqual(edited.parts);
  expect(redone.project.infillPct).toBe(37);
  expect(studyFingerprint(base.parts, base.project)).not.toBe(studyFingerprint(edited.parts, edited.project));

  function Harness() {
    result.current = useTrainingImages({
      parts: redone.doc.parts,
      project: redone.project,
      active: base.kase,
      sim: { buildModel: async () => null, worldParts: [] } as unknown as Simulation,
      rig: buildRig(redone.project.joints ?? [], redone.doc.parts),
      sceneId: 'camera-study',
      partners: () => [],
      showDataset: () => {},
      showToast: () => {},
    });

    return null;
  }

  renderToString(createElement(Harness));
  await result.current!.make({ count: 1, seed: 1, cameras: ['eye'] }, base.kase);

  const job = vi.mocked(makeTrainingImages).mock.calls[0][0];
  const plan = trainingPlan(job);
  const view = plan.views[0];

  expect(job.parts.find((part) => part.id === 'eye')).toBe(redone.doc.parts.find((part) => part.id === 'eye'));
  expect(view.lens).toEqual({ model: 'fisheye', fovDeg: 180 });
  expect(view.position).toEqual([expect.closeTo(0, 8), expect.closeTo(210, 8), expect.closeTo(0, 8)]);
  expect(view.target).toEqual([expect.closeTo(0, 8), expect.closeTo(210, 8), expect.closeTo(-100, 8)]);
  expect(base.parts.find((part) => part.id === 'eye')?.cameraLens).toEqual({ model: 'pinhole', hfovDeg: 90 });
});
