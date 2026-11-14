import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { armTemplate } from '../../electron/cad-mcp/recipes/templates.mjs';
import { toCad, toScene } from '../agent/agentFrame';
import { buildSkeleton } from '../agent/skeleton';
import type { ZUpVec } from '../types/skeleton';
import { jointVerdict } from './actuatorSizing';
import { actuatorSpec } from './skeletonMargins';
import { anglesTo, armTool, innerRange, type ArmShape } from './armReach';
import { MAX_LINK_MM, MAX_RISE_MM, STEP_MM } from './armSearch';
import { armPayload, armTip, REACH_MM, sizeArm, type ArmTarget, type SizedArm } from './armSizing';
import { forwardKinematics } from './kinematicsMotion';
import { reachWithTip, skeletonRig } from './skeletonRig';
import { skeletonSizing } from './skeletonSizing';
import { ratingAt } from './actuatorRules';

const TARGETS: ArmTarget[] = [
  { id: 'desk', name: 'Desk', at: [0, -300, 0] },
  { id: 'shelf', name: 'Top Shelf', at: [120, -220, 380] },
  { id: 'bin', name: 'Bin', at: [-260, -120, -60] },
];

function sized(payloadG: number, targets = TARGETS): SizedArm {
  const result = sizeArm({ targets, payloadG });

  if (!('arm' in result)) throw new Error(result.problem);

  return result.arm;
}

const total = (shape: ArmShape) => shape.baseHeight + shape.links.reduce((s, l) => s + l, 0);

function* gridUnder(budget: number, count: number, first: number): Generator<number[]> {
  if (!count) {
    yield [];

    return;
  }

  const lo = first;
  const hi = first === 0 ? MAX_RISE_MM : MAX_LINK_MM;

  for (let v = lo; v <= hi && v + (count - 1) * 75 < budget; v += STEP_MM)
    for (const rest of gridUnder(budget - v, count - 1, 75)) yield [v, ...rest];
}

function* shorterShapes(arm: ArmShape): Generator<ArmShape> {
  for (const [rise, l1, l2, l3] of gridUnder(total(arm), 4, 0)) yield { ...arm, links: [l1, l2, l3], baseHeight: rise };
}

describe('sizeArm', () => {
  const arm = sized(200);
  const skeleton = buildSkeleton(arm.skeleton).skeleton;

  it('reaches every target within 2 mm with every joint 10% inside its range', () => {
    const rig = skeletonRig(skeleton);
    const tip = armTip(skeleton);

    for (const t of TARGETS) {
      const seed = arm.reach.find((r) => r.id === t.id)!.angles;
      const solved = reachWithTip(rig, tip, t.at, seed);
      const posed = forwardKinematics(rig, { values: solved.values });
      const at = new THREE.Vector3(...toScene(tip.point)).applyMatrix4(posed.joint.get(tip.joint)!);

      expect(at.distanceTo(new THREE.Vector3(...toScene(t.at))), t.id).toBeLessThanOrEqual(REACH_MM);

      for (const j of skeleton.joints) {
        const [lo, hi] = innerRange(j.range!);
        const value = solved.values[j.id] ?? 0;

        expect(value, `${t.id} ${j.id}`).toBeGreaterThanOrEqual(lo - 1e-6);
        expect(value, `${t.id} ${j.id}`).toBeLessThanOrEqual(hi + 1e-6);
      }
    }
  });

  it('finds no shorter link set on the 5 mm grid that reaches them', () => {
    let tried = 0;

    for (const shape of shorterShapes(arm.shape)) {
      tried++;
      expect(
        TARGETS.some((t) => !anglesTo(shape, t.at)),
        `${shape.baseHeight} ${shape.links}`,
      ).toBe(true);
    }

    expect(tried).toBeGreaterThan(0);
  });

  it('passes the hold check at every joint at the supply voltage', () => {
    const input = skeletonSizing(skeleton);

    if (typeof input === 'string') throw new Error(input);

    for (const joint of input.joints) {
      const act = actuatorSpec(skeleton.joints.find((j) => j.id === joint.id)!.actuator)!;

      expect(jointVerdict(joint, joint, act, arm.servos.volts).status, joint.id).toBe('pass');
    }
  });

  it('never picks a weaker shoulder servo for a heavier payload', () => {
    const shoulderNm = (a: SizedArm) => ratingAt(actuatorSpec(a.servos.keys[1])!, a.servos.volts).stallNm;

    for (const grams of [25, 50, 100])
      expect(shoulderNm(sized(grams * 2))).toBeGreaterThanOrEqual(shoulderNm(sized(grams)));
  });

  it('gives no arm for a target 2 m away and names it', () => {
    const far: ArmTarget = { id: 'far', name: 'Far Shelf', at: [2000, 0, 0] };

    expect(sizeArm({ targets: [...TARGETS, far], payloadG: 200 })).toEqual({
      problem: 'Far Shelf is out of reach.',
      target: 'far',
    });
  });

  it('gives the same arm for the same input', () => {
    expect(sized(200)).toEqual(arm);
  });

  it('places the tool where the template and the rig put it', () => {
    const shape: ArmShape = { links: [90, 150, 120], baseHeight: 20, base: [10, 20, 5], yaw: 30 };
    const rest = { base_yaw: 0, shoulder_pitch: 0, elbow_pitch: 0, wrist_pitch: 0 };

    armTemplate(shape).tool.forEach((v, k) => expect(armTool(shape, rest)[k]).toBeCloseTo(v, 1));

    const bent = { base_yaw: 20, shoulder_pitch: 30, elbow_pitch: -40, wrist_pitch: 25 };
    const sk = buildSkeleton(armPayload(shape, 200)).skeleton;
    const tip = armTip(sk);
    const posed = forwardKinematics(skeletonRig(sk), { values: bent });
    const at = toCad(
      new THREE.Vector3(...toScene(tip.point)).applyMatrix4(posed.joint.get(tip.joint)!).toArray() as ZUpVec,
    );

    armTool(shape, bent).forEach((v, k) => expect(at[k]).toBeCloseTo(v, 0));
  });
});
