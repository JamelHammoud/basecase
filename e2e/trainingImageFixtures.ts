import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { CameraView } from '../src/cameras/views';
import { touchTheDots } from '../src/cases/testing';
import { fixtureRobots } from '../src/sim/fixtures/robots';
import { box, joint } from '../src/sim/fixtures/parts';
import type { RobotJoint, ScenePart } from '../src/types/robotics';
import { buildRig, type V3 } from '../src/utils/kinematics';
import { buildCase, builderRobot } from '../src/cases/caseBuilder';
import type { MakeImagesJob } from '../src/vision/makeImages';

export const trainingView: CameraView = {
  key: 'outside',
  label: 'Outside',
  part: null,
  position: [0, 1000, 2000],
  target: [0, 1000, 0],
  up: [0, 1, 0],
  fovDeg: 45,
  lens: { model: 'pinhole', hfovDeg: 60 },
};

function meshFixture(id: string, at: V3, geometries: THREE.BufferGeometry[], points: Record<string, V3>) {
  const geometry = mergeGeometries(geometries.map((item) => (item.index ? item.toNonIndexed() : item)))!;

  geometry.computeBoundingBox();

  const bounds = geometry.boundingBox!;
  const size = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());

  geometry.translate(-center.x, -center.y, -center.z);

  const worldPoints = Object.fromEntries(
    Object.entries(points).map(([name, value]) => {
      const point = new THREE.Vector3(...value).sub(center).add(new THREE.Vector3(...at));

      return [name, point.toArray() as V3];
    }),
  );
  const part: ScenePart = {
    ...box(id, at, [size.x, size.y, size.z], 100),
    kind: 'mesh',
    mesh: {
      positions: Array.from(geometry.getAttribute('position').array),
      indices: Array.from({ length: geometry.getAttribute('position').count }, (_, index) => index),
      baseSize: [size.x, size.y, size.z],
    },
  };

  return { part, points: worldPoints };
}

function mug() {
  const profile = [
    [45, -40],
    [45, 40],
    [55, 40],
    [55, -40],
    [45, -40],
  ];
  const cup = new THREE.LatheGeometry(
    profile.map(([x, y]) => new THREE.Vector2(x, y)),
    48,
  );
  const handle = new THREE.TorusGeometry(30, 8, 12, 48).translate(75, 0, 0);

  return meshFixture('mug', [-250, 1000, 0], [cup, handle], {
    hole: [75, 0, 0],
    handle: [105, 0, 8],
    body: [0, 0, 55],
  });
}

function person() {
  const pieces = [
    new THREE.CapsuleGeometry(40, 120, 8, 16),
    new THREE.SphereGeometry(35, 20, 12).translate(0, 150, 0),
    new THREE.CapsuleGeometry(12, 130, 6, 12).rotateZ(-0.45).translate(85, 0, 0),
    new THREE.CapsuleGeometry(12, 130, 6, 12).rotateZ(0.45).translate(-85, 0, 0),
    new THREE.CapsuleGeometry(15, 130, 6, 12).translate(25, -150, 0),
    new THREE.CapsuleGeometry(15, 130, 6, 12).translate(-25, -150, 0),
    new THREE.SphereGeometry(15, 12, 8).translate(25, -225, 0),
    new THREE.SphereGeometry(15, 12, 8).translate(-25, -225, 0),
  ];

  return meshFixture('person', [250, 1000, 0], pieces, {
    head: [0, 150, 35],
    hidden: [0, 150, -35],
    toe: [25, -225, 15],
    gap: [0, -175, 0],
  });
}

export function meshTrainingJob(): { job: MakeImagesJob; points: Record<string, Record<string, V3>> } {
  const cup = mug();
  const human = person();
  const joints = ['head', 'hidden', 'toe'].map((name) =>
    joint({
      id: name,
      link: ['anchor', 'person'],
      origin: human.points[name],
      axis: [0, 1, 0],
      effortNm: 1,
    }),
  );

  const base = touchTheDots(fixtureRobots().find((robot) => robot.id === 'arm-3dof')!);
  const object = {
    ...base.world.objects[0],
    id: cup.part.id,
    name: cup.part.name,
    kind: 'custom_model' as const,
    position: cup.part.position,
    rotation: cup.part.rotation,
    size: [cup.part.dimensions.width, cup.part.dimensions.height, cup.part.dimensions.depth] as V3,
    color: cup.part.color,
    behavior: 'static' as const,
    points: {
      handle: new THREE.Vector3(...cup.points.handle).sub(new THREE.Vector3(...cup.part.position)).toArray() as V3,
    },
  };
  const kase = { ...base, world: { objects: [object] }, images: { cameraTolerance: { mm: 0, deg: 0 } } };

  return {
    job: { parts: [human.part], world: [cup.part], joints, views: [trainingView], kase, seed: 0, count: 1 },
    points: { mug: cup.points, person: human.points },
  };
}

export function boxTrainingJob(): MakeImagesJob {
  const parts = Array.from({ length: 500 }, (_, index) => {
    const x = ((index % 25) - 12) * 75;
    const y = 1000 + (Math.floor(index / 25) - 9.5) * 55;
    const depth = 20 + (index % 7) * 5;

    return box(`box-${index}`, [x, y, 0], [35 + (index % 15), 25 + (index % 10), depth], 10);
  });

  return { parts, world: [], joints: [], views: [trainingView], seed: 42, count: 1 };
}

export function roverPersonTrainingJob(): MakeImagesJob {
  const rover = fixtureRobots().find((robot) => robot.id === 'rover-diff')!;
  const human = person().part;
  const personPart = { ...human, name: 'Person', position: [0, 300, 1200] as V3 };
  const built = buildCase(
    { goal: 'reach', world: 'floor' },
    builderRobot(buildRig(rover.joints, rover.parts), rover.parts),
  );

  if (!built.ok) throw new Error(built.problem);

  const object = {
    id: personPart.id,
    name: personPart.name,
    kind: 'custom_model' as const,
    position: personPart.position,
    rotation: personPart.rotation,
    size: [personPart.dimensions.width, personPart.dimensions.height, personPart.dimensions.depth] as V3,
    color: personPart.color,
    behavior: 'static' as const,
  };

  return {
    parts: rover.parts,
    joints: rover.joints,
    world: [personPart],
    kase: { ...built.kase, world: { objects: [object] } },
    views: [
      {
        ...trainingView,
        key: 'front',
        label: 'Front',
        part: rover.parts[0].id,
        position: [0, 120, 100],
        target: personPart.position,
      },
    ],
    seed: 7,
    count: 1,
    classes: ['Person'],
  };
}

export function hexapodTrainingJob(): MakeImagesJob {
  const body = { ...box('body', [0, 100, 0], [140, 40, 140], 100), kind: 'sphere' as const };
  const parts: ScenePart[] = [body];
  const joints: RobotJoint[] = [];

  for (let index = 0; index < 6; index++) {
    const angle = (index * Math.PI) / 3;
    const foot: V3 = [180 * Math.cos(angle), 20, 180 * Math.sin(angle)];
    const origin = new THREE.Vector3(0, 100, 0);
    const end = new THREE.Vector3(...foot);
    const direction = end.clone().sub(origin);
    const euler = new THREE.Euler().setFromQuaternion(
      new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.clone().normalize()),
    );
    const leg = {
      ...box(
        `leg${index}`,
        origin.clone().add(end).multiplyScalar(0.5).toArray() as V3,
        [12, direction.length(), 12],
        10,
      ),
      rotation: [euler.x, euler.y, euler.z].map(THREE.MathUtils.radToDeg) as V3,
    };
    const toe = { ...box(`toe${index}`, foot, [24, 24, 24], 5), kind: 'sphere' as const };

    parts.push(leg, toe);
    joints.push({
      ...joint({ id: `hip${index}`, link: [body.id, leg.id], origin: [0, 100, 0], axis: [0, 1, 0], effortNm: 1 }),
      child: [leg.id, toe.id],
      limb: 'leg',
    });
  }

  return {
    parts,
    joints,
    world: [],
    seed: 0,
    count: 1,
    views: [
      {
        ...trainingView,
        key: 'overhead',
        label: 'Overhead',
        position: [0, 1200, 0],
        target: [0, 0, 0],
        up: [0, 0, -1],
      },
    ],
  };
}
