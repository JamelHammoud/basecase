import type { RobotRun } from '../robot/runBuffer';
import type { SimModel } from '../sim/mjcfTypes';
import type { MainModule } from '@mujoco/mujoco';
import { sha256 } from '../cases/tries';
import { bodyAnalysisScenario, analysisArmScene } from './bodyAnalysisMatrix.fixtures';

export function bodyExecutionScene() {
  const scene = analysisArmScene();
  const joints = scene.joints.slice(0, 1);

  return { ...scene, parts: scene.parts.slice(0, 2), joints, project: { ...scene.project, joints } };
}

export function parkedBodyRun(model: SimModel): RobotRun {
  const joints = model.joints.map((joint) => joint.id);
  const positions = model.joints.map(
    (joint) => (model.initial.values[joint.id] ?? 0) * (joint.type === 'revolute' ? Math.PI / 180 : 0.001),
  );
  const frames = Array.from({ length: 65 }, (_, index) => ({ at: index * 31.25, positions: [...positions] }));

  return {
    joints,
    statuses: frames,
    intents: frames.map((frame) => ({ at: frame.at, joints: [...positions] })),
    faultJoint: null,
    faultAt: 0,
    message: '',
  };
}

export async function colocatedBodyScenario(mj: MainModule) {
  const { request } = await bodyAnalysisScenario(mj, 'coupled wrist');
  const terminal = request.model.bodies.find((body) => body.joint === 'wrist')!;
  const at = request.model.bodyPayloads![terminal.name];
  const bodyStart = request.model.xml.indexOf(`<body name="${terminal.name}"`);
  const geomStart = request.model.xml.indexOf('<geom ', bodyStart);
  const geomEnd = request.model.xml.indexOf('/>', geomStart) + 2;

  request.model.xml =
    request.model.xml.slice(0, geomStart) +
    `<geom name="colocated" type="sphere" size="0.001" pos="${at.join(' ')}" mass="0.2" contype="0" conaffinity="0"/>` +
    request.model.xml.slice(geomEnd);
  request.source.modelHash = await sha256(request.model.xml);

  return { request, terminal, bodyStart };
}
