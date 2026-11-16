import { componentSize } from '../data/components';
import { cameraViews } from '../cameras/views';
import { worldItem, type WorldObject } from '../cases/schema';
import { presetCase } from '../cases/testing';
import { sha256 } from '../cases/tries';
import type { StoredTry } from '../cases/tryFile';
import { roundWheelRover, fixtureRobots } from '../sim/fixtures/robots';
import { box, joint, fixtureMeasures, fixtureTriangles } from '../sim/fixtures/parts';
import type { SimModel } from '../sim/mjcfTypes';
import { buildMjcf } from '../sim/mjcf';
import { toMj, quatToMj } from '../sim/mjcfFrames';
import type { Recording } from '../sim/recorder';
import { DEFAULT_PROJECT, type ScenePart } from '../types/robotics';
import { buildRig } from '../utils/kinematics';
import { Quaternion, Vector3 } from 'three';

export const VISIBILITY_WORKFLOWS = [
  'rover obstacle',
  'wrist grasp',
  'quadruped terrain',
  'pan tilt',
  'finger occlusion',
  'inspection arm',
  'complementary cameras',
  'fisheye edge',
  'imported corridor',
  'articulated fixture',
] as const;

export function visibilityCamera(id = 'eye'): ScenePart {
  return {
    ...box(id, [-2.47, 200, 5.12], [25, 12, 24], 3),
    kind: 'component',
    componentId: 'raspberry-pi-camera-3',
    dimensions: componentSize('raspberry-pi-camera-3'),
    rotation: [90, 0, 0],
    cameraLens: { model: 'pinhole', hfovDeg: 90 },
  };
}

const object = (id: string, position: [number, number, number], size: [number, number, number]): WorldObject => ({
  id,
  name: id,
  kind: 'box',
  position,
  rotation: [0, 0, 0],
  size,
  color: '#888888',
  behavior: 'dynamic',
  massG: 1,
});

export function visibilityDesign(index: number) {
  const robots = fixtureRobots();
  const robot = [
    robots[7],
    robots[5],
    robots[0],
    robots[5],
    robots[6],
    robots[5],
    robots[7],
    robots[7],
    robots[7],
    robots[6],
  ][index];
  const camera = visibilityCamera();
  const parts = [...robot.parts, camera];
  const cameras =
    index === 6
      ? [camera, { ...visibilityCamera('second'), position: [397.53, 200, 5.12] as [number, number, number] }]
      : [camera];
  const target = object('target', [0, 200, -1000.005], [200, 200, 0.01]);
  const cover = object('cover', [1000, 200, -500.005], [100, 100, 0.01]);

  if (index === 6) parts.push(cameras[1]);

  if (index === 7) {
    target.position = [1000.005, 200, -100];
    target.size = [0.01, 200, 200];
    camera.cameraLens = { model: 'fisheye', fovDeg: 200 };
  }

  if (index === 9)
    cover.joint = {
      type: 'prismatic',
      origin: cover.position,
      axis: [1, 0, 0],
      range: [-1000, 0],
      damping: 0.1,
      frictionloss: 0,
    };

  const kase = {
    ...presetCase(roundWheelRover(), 'reach-the-flag'),
    id: 'camera-visibility',
    name: VISIBILITY_WORKFLOWS[index],
    world: { objects: [target, cover], trueSize: true },
  };
  const jointIndex = index === 4 ? robot.joints.length - 3 : robot.joints.length - 1;
  const joints = robot.joints.map((joint, i) =>
    i === jointIndex && [1, 3, 4, 5].includes(index) ? { ...joint, child: [...joint.child, camera.id] } : joint,
  );

  if (index === 6) {
    joints[0] = { ...joints[0], parent: [...joints[0].parent, camera.id] };
    joints.push(
      joint({
        id: 'second-pan',
        link: [robot.parts[0].id, 'second'],
        origin: cameras[1].position,
        axis: [0, 1, 0],
        effortNm: 1,
      }),
    );
  }

  if (index === 4) {
    const finger = parts.find((part) => part.id === 'finger_left')!;

    Object.assign(finger, { position: [100, 200, -500.005], dimensions: { width: 100, height: 100, depth: 0.01 } });
    kase.world.objects = [target];

    const fingerIndex = joints.findIndex((joint) => joint.id === 'finger_left');

    joints[fingerIndex] = { ...joints[fingerIndex], origin: finger.position, range: [-100, 0] };
  }

  const project = { ...DEFAULT_PROJECT, joints, cases: [kase] };

  return { parts, project, kase, cameras, world: kase.world.objects.map(worldItem) };
}

export async function visibilityFixture(index: number) {
  const design = visibilityDesign(index);
  const rig = buildRig(design.project.joints, design.parts);
  const model = buildMjcf({
    parts: design.parts,
    project: design.project,
    rig,
    measures: fixtureMeasures(design.parts),
    partTriangles: fixtureTriangles(design.parts),
    world: design.world,
  });
  const recording = visibilityRecording(model, index);

  const stored: StoredTry = {
    version: 1,
    id: `camera-visibility-${index}`,
    sceneId: 'camera-study',
    robot: {
      name: VISIBILITY_WORKFLOWS[index],
      modelHash: await sha256(model.xml),
      joints: model.joints.map((joint) => joint.id),
    },
    case: { id: design.kase.id, name: design.kase.name, hash: await sha256(JSON.stringify(design.kase)) },
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

  return {
    ...design,
    model,
    recording,
    stored,
    views: cameraViews(design.parts, design.world, design.project.cameras),
  };
}

export function visibilityRecording(model: SimModel, index: number): Recording {
  const recording: Recording = {
    frames: 4,
    dt: 1,
    nq: 0,
    nv: 0,
    nu: 0,
    nbody: model.bodies.length,
    t: Float32Array.of(0, 1, 2, 3),
    ctrl: new Float32Array(),
    qpos: new Float64Array(),
    qvel: new Float32Array(),
    poses: new Float32Array(4 * model.bodies.length * 7),
  };

  for (let sample = 0; sample < 4; sample++) {
    model.bodies.forEach((body, i) => {
      const { at, turn } = recordedBody(body, sample, index);

      recording.poses.set([...toMj(at), ...quatToMj(turn)], (sample * model.bodies.length + i) * 7);
    });
  }

  return recording;
}

function recordedTranslation(body: SimModel['bodies'][number], sample: number, index: number) {
  const target = sample === 1 && ![1, 3, 6, 7].includes(index) ? 2000 : 0;
  const cover = sample >= 2 && index !== 7 ? [0, 0, -1000, -950][sample] : 0;
  const eye = sample === 1 && index === 6 ? 2000 : 0;
  const finger_left = index === 4 ? [0, 0, -100, -50][sample] : 0;
  const moves: Record<string, number> = { target, cover, eye, finger_left };

  return [...body.parts, ...(body.world ?? [])].reduce((sum, id) => sum + (moves[id] ?? 0), 0);
}

function recordedBody(body: SimModel['bodies'][number], sample: number, index: number) {
  const at = new Vector3(...body.origin);
  const turn = new Quaternion();
  const eyeTurn = body.parts.includes('eye') && sample === 1 && [1, 3].includes(index);
  const secondTurn = body.parts.includes('second') && sample === 0;

  at.x += recordedTranslation(body, sample, index);

  if (eyeTurn || secondTurn) {
    turn.setFromAxisAngle(new Vector3(0, 1, 0), Math.PI);
    at.applyQuaternion(turn);
  }

  return { at, turn };
}
