import { stageCase, stagedEffectors } from '../cases/caseCast';
import type { Case } from '../cases/schema';
import type { SlotRobot } from '../cases/slots';
import { stageFrames } from '../cases/stageFrames';
import { trySignals, type TryRecord } from '../cases/tries';
import type { TrySegment } from '../cases/tryLabels';
import { segmentInput } from '../datasets/segmentInput';
import type { SegmentScene } from '../datasets/segmentRobot';
import { segmentInWorker } from '../datasets/segmentsClient';
import type { SimModel } from '../sim/mjcfTypes';
import type { Recording } from '../sim/recorder';
import type { RobotJoint, ScenePart } from '../types/robotics';
import type { Rig } from '../utils/kinematics';

export interface SegmentingScene {
  model: SimModel;
  rig: Rig;
  parts: ScenePart[];
  joints: RobotJoint[];
  cases: Case[];
  partners: SlotRobot[];
}

type Scene = Omit<SegmentScene, 'jointQpos'>;

async function caseScene(scene: SegmentingScene, kase: Case, recording: Recording) {
  const staged = stageCase(kase, { rig: scene.rig, parts: scene.parts }, scene.partners);
  const { effector, effectors } = stagedEffectors(staged, { rig: scene.rig, parts: scene.parts });
  const segmentScene: Scene = {
    model: scene.model,
    rig: scene.rig,
    parts: scene.parts,
    joints: scene.joints,
    effector,
    objects: staged.kase.world.objects,
  };
  const scoring = { kase: staged.kase, model: scene.model, recording, rig: scene.rig, effector, effectors };
  const stages = await stageFrames(staged.kase.task.contract, trySignals(scoring)).catch(() => []);

  return { segmentScene, stages };
}

const bare = (scene: SegmentingScene): Scene => ({
  model: scene.model,
  rig: scene.rig,
  parts: scene.parts,
  joints: scene.joints,
  effector: null,
  objects: [],
});

export async function ruleSegments(record: TryRecord, recording: Recording, scene: SegmentingScene) {
  const kase = scene.cases.find((c) => c.id === record.caseId);
  const fits = recording.nbody === scene.model.bodies.length;
  const known = kase && fits && !record.real ? await caseScene(scene, kase, recording) : null;
  const input = segmentInput(recording, {
    scene: known?.segmentScene ?? bare(scene),
    stages: known?.stages ?? [],
    real: !!record.real || !known,
  });
  const foreign = {
    bodies: Array.from({ length: recording.nbody }, (_, i) => i),
    root: null,
    mobility: null,
    jaws: [],
  };
  const segments = await segmentInWorker(fits ? input : { ...input, robot: { ...input.robot, ...foreign } });

  return segments as TrySegment[];
}
