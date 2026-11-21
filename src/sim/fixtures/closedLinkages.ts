import { BAM_STS3215_7V4 } from '../../data/servoFits';
import { linkageParts } from '../../linkage/linkageParts';
import { DEFAULT_PROJECT } from '../../types/robotics';
import { buildRig } from '../../utils/kinematics';
import type { LinkageSolution } from '../../utils/linkage';
import { GROUND_PLANE, type SketchPlane } from '../../utils/sketch/placement';
import { fixtureMeasures, fixtureTriangles } from './parts';
import { buildMjcf } from '../mjcf';

export const closedLinkages = [
  { name: 'pump', lengths: [40, 20, 50, 50] },
  { name: 'parallel gripper', lengths: [60, 25, 60, 25] },
  { name: 'walking leg', lengths: [45, 18, 55, 50] },
  { name: 'rocking platform', lengths: [70, 20, 65, 40] },
  { name: 'lifting linkage', lengths: [50, 15, 45, 35] },
  { name: 'mirrored', lengths: [40, 20, 50, 50], mirrored: true },
  { name: 'tilted plane', lengths: [40, 20, 50, 50], tilted: true },
  { name: 'scaled', lengths: [120, 60, 150, 150] },
  { name: 'floating robot', lengths: [40, 20, 50, 50], floating: true },
  { name: 'two mechanisms', lengths: [40, 20, 50, 50], count: 2 },
];

export function closedLinkage(spec = closedLinkages[0]) {
  const [ground, crank, coupler, rocker] = spec.lengths;
  const solution: LinkageSolution = {
    linkage: { origin: [0, 0], angle: 15, ground, crank, coupler, rocker, point: [coupler * 1.4, 10] },
    crank: [40, 140],
    grashof: 'crank-rocker',
    maxErrorMm: 0,
    rmsErrorMm: 0,
    minTransmissionDeg: 20,
  };
  const plane: SketchPlane = spec.tilted
    ? { origin: [0, 300, 0], u: [0, 0, 1], v: [0, 1, 0], n: [-1, 0, 0] }
    : { ...GROUND_PLANE, origin: [0, 300, 0], ...(spec.mirrored ? { v: [0, 0, 1], n: [0, -1, 0] } : {}) };
  const builds = Array.from({ length: spec.count ?? 1 }, (_, i) =>
    linkageParts({ ...solution, linkage: { ...solution.linkage, origin: [i * 200, 0] } }, plane, `fb${i}`),
  );
  const parts = builds.flatMap((b) => b.parts);
  const joints = builds.flatMap((b) => b.joints);

  for (let i = 1; i < builds.length; i++) {
    const index = i * 3;

    joints[index] = { ...joints[index], parent: [...joints[index].parent, 'fb0-ground'] };
  }

  const project = { ...DEFAULT_PROJECT, joints };
  const rig = buildRig(joints, parts);
  const input = {
    parts,
    project,
    rig,
    measures: fixtureMeasures(parts),
    servoFits: Object.fromEntries(builds.map((b) => [b.crankJoint, { fit: BAM_STS3215_7V4, volts: 7.4 }])),
    partTriangles: fixtureTriangles(parts),
    fixedBase: Object.fromEntries(rig.robots.map((r) => [r.key, !spec.floating])),
  };

  return { builds, input, model: buildMjcf(input) };
}
