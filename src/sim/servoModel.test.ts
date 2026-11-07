import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { actuatorOf } from '../data/components';
import { BAM_STS3215_7V4 } from '../data/servoFits';
import { measureTriangles } from '../three/meshMeasure';
import { DEFAULT_PROJECT, type RobotJoint, type ScenePart } from '../types/robotics';
import { buildRig } from '../utils/kinematics';
import { buildMjcf } from './mjcf';
import { historySamples, servoDynamics } from './servoModel';

const box = (id: string, y: number, extra: Partial<ScenePart> = {}): ScenePart => ({
  id,
  name: id,
  kind: 'box',
  category: 'structure',
  role: 'solid',
  position: [0, y, 0],
  rotation: [0, 0, 0],
  dimensions: { width: 20, height: 20, depth: 20 },
  color: '#888888',
  note: '',
  visible: true,
  locked: false,
  massG: 100,
  ...extra,
});

function armWith(variant: string) {
  const parts = [
    box('base', 300),
    box('servo', 260, { componentId: 'feetech-sts3215', componentVariant: variant }),
    box('link', 180),
  ];
  const joint: RobotJoint = {
    id: 'shoulder',
    name: 'shoulder',
    type: 'revolute',
    parent: ['base', 'servo'],
    child: ['link'],
    origin: [0, 260, 0],
    axis: [1, 0, 0],
    range: [-90, 90],
    actuators: ['servo'],
  };
  const cube = new Float32Array(new THREE.BoxGeometry(20, 20, 20).toNonIndexed().getAttribute('position').array);

  return buildMjcf({
    parts,
    rig: buildRig([joint], parts),
    project: { ...DEFAULT_PROJECT, joints: [joint] },
    measures: Object.fromEntries(parts.map((p) => [p.id, { ...measureTriangles(cube), centroid: p.position }])),
    partTriangles: () => cube,
  });
}

describe('the MJCF writer', () => {
  it('writes a measured servo as kp, kv 0, back-EMF damping and a native delay', () => {
    const model = armWith('c001');

    expect(model.joints[0].dynamics).toBe('measured');
    expect(model.xml).toMatch(/<position [^>]*kv="0"[^>]*delay="0.004981" nsample="5" interp="linear"/);
    expect(model.xml).not.toMatch(/dampratio/);
  });

  it('keeps the estimated model for a servo with no fit', () => {
    const model = armWith('c018');

    expect(model.joints[0].dynamics).toBe('estimated');
    expect(model.xml).toMatch(/dampratio="1"/);
    expect(model.xml).not.toMatch(/delay=/);
  });
});

const sts = actuatorOf('feetech-sts3215', 'c001')!;
const xl = actuatorOf('dynamixel-xl330-m288')!;

describe('servo dynamics from BAM fits', () => {
  it('gives the STS3215 at 7.4 V and P32 a kp of 18-22, not the 998 a 1-ohm guess gives', () => {
    const d = servoDynamics([sts], 0)!;

    expect(d.kp).toBeGreaterThan(18);
    expect(d.kp).toBeLessThan(22);
    expect(d.damping).toBeCloseTo(BAM_STS3215_7V4.friction.viscous + 1.2753202369175398 ** 2 / 2.753421214375944, 9);
    expect(d.armature).toBeCloseTo(0.021564290129722483, 12);
    expect(d.forceNm).toBeCloseTo((0.97 * 7.4 * 1.2753202369175398) / 2.753421214375944, 9);
    expect(d.delayS).toBeCloseTo(0.0049807526194816515, 12);
  });

  it('adds gearbox friction in proportion to the weight the joint holds', () => {
    const free = servoDynamics([xl], 0)!;
    const loaded = servoDynamics([xl], 0.5)!;

    expect(loaded.frictionloss - free.frictionloss).toBeCloseTo(0.5 * 0.10651211228971481, 9);
  });

  it('sums two servos on one joint, sharing the load between them', () => {
    const one = servoDynamics([sts], 1)!;
    const two = servoDynamics([sts, sts], 1)!;

    expect(two.kp).toBeCloseTo(2 * one.kp, 9);
    expect(two.forceNm).toBeCloseTo(2 * one.forceNm, 9);
    expect(two.frictionloss).toBeCloseTo(
      2 * BAM_STS3215_7V4.friction.base + one.frictionloss - BAM_STS3215_7V4.friction.base,
      9,
    );
  });

  it('falls back when any servo on the joint has no fit', () => {
    expect(servoDynamics([sts, actuatorOf('feetech-sts3215', 'c018')!], 0)).toBeNull();
    expect(servoDynamics([], 0)).toBeNull();
  });

  it('keeps enough history samples to cover the delay', () => {
    expect(historySamples(0.0102, 0.002)).toBe(8);
    expect(historySamples(0.005, 0.002) * 0.002).toBeGreaterThan(0.005);
  });
});
