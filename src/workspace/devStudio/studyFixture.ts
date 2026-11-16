import { keepTries } from '../../cases/tryStore';
import { sha256 } from '../../cases/tries';
import type { StoredTry } from '../../cases/tryFile';
import { visibilityMeshFiles } from '../../study/visibilityMeshes';
import { visibilityRecording } from '../../study/visibilityFixtures';
import { buildTryScene } from '../../vision/trySceneClient';
import type { Studio } from './types';

export async function keepStudyTry(studio: Studio) {
  const { core } = studio();
  const scene = { parts: core.docs.partsRef.current, project: core.docs.projectRef.current };
  const kase = scene.project.cases![0];
  const stored: StoredTry = {
    version: 1,
    id: 'camera-study-try',
    sceneId: 'camera-study',
    robot: { name: 'Camera rover', modelHash: '', joints: [] },
    case: { id: kase.id, name: kase.name, hash: await sha256(JSON.stringify(kase)) },
    source: 'case',
    input: null,
    startedAt: '2026-11-16T00:00:00.000Z',
    seconds: 4,
    frames: 4,
    rate: 1,
    outcome: { verdict: 'unjudged', margin: null },
    seed: 1,
    sourceTry: null,
    faults: [],
  };
  const meshes = await visibilityMeshFiles(scene.parts);
  const prepared = await buildTryScene({ scene, stored, partners: [], meshes, assets: {} });

  if (!prepared.model) throw new Error('Expected a generated camera model');

  stored.robot.modelHash = await sha256(prepared.model.xml);
  stored.robot.joints = prepared.model.joints.map((joint) => joint.id);
  await keepTries([{ stored, recording: visibilityRecording(prepared.model, 0) }]);
  core.simTraining.cases.open(kase.id);

  return stored.id;
}
