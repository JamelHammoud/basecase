import { describe, expect, it } from 'vitest';
import { actuatorOf } from '../data/components';
import { cycloidalRatio, cycloidalSpec, cycloidalVariantId } from '../data/generatedActuators';
import { buildMjcf } from '../sim/mjcf';
import { FALL_BIPED_POSE, fallBiped, LOADED_BIPED_BODY_G } from '../sim/fixtures/fallBiped';
import { fixtureTriangles, placedMeasures } from '../sim/fixtures/parts';
import { DEFAULT_PROJECT, type RobotJoint, type ScenePart } from '../types/robotics';
import { buildBom } from '../utils/bom';
import { runEngineering } from '../utils/engineering';
import { buildRig } from '../utils/kinematics';
import { designRatio, PIN_COUNTS, sizedDesign, type CycloidalDesign } from './cycloidal';
import { pickActuator, type ActuatorLoads, type BedSize } from './pick';
import { withActuator } from './withActuator';

const BED: BedSize = { name: 'Bambu Lab X1 Carbon', width: 256, depth: 256, height: 256 };
const D6374 = 'odrive-d6374';

interface Scene {
  parts: ScenePart[];
  joints: RobotJoint[];
}

const biped = (): Scene => {
  const robot = fallBiped('c001', LOADED_BIPED_BODY_G);

  return { parts: robot.parts, joints: robot.joints };
};

const projectOf = (scene: Scene) => ({ ...DEFAULT_PROJECT, joints: scene.joints, pose: FALL_BIPED_POSE });

const engineering = (scene: Scene) =>
  runEngineering({
    parts: scene.parts,
    project: projectOf(scene),
    measures: placedMeasures(scene.parts),
    servoOutputs: {},
  });

const kneeItem = (scene: Scene) =>
  engineering(scene)
    .rows.find((r) => r.check === 'Servo torque')
    ?.items?.find((i) => i.joint === 'l_knee' || /Left knee:/.test(i.text));

function made(scene: Scene, joint: string, design: CycloidalDesign): Scene {
  const edit = withActuator(scene, joint, design, `${joint}-actuator`);

  if (typeof edit === 'string') throw new Error(edit);

  return { parts: edit.parts, joints: edit.joints };
}

function madeFromFix(scene: Scene, joint: string): Scene {
  const loads = engineering(scene).joints.find((l) => l.joint.id === joint)!;
  const pick = pickActuator({ loadNm: loads.loadNm, rmsNm: loads.loadNm }, BED);

  if ('refusal' in pick) throw new Error(pick.refusal);

  return made(scene, joint, pick.design);
}

describe('cycloidal actuator spec', () => {
  it('reduces a D6374 by pins ÷ (pins − lobes), as built, with the estimate labelled', () => {
    for (const pins of PIN_COUNTS) {
      const design = sizedDesign(D6374, pins, cycloidalSpec(D6374, pins)!.stallNm);

      expect(designRatio(design)).toBe(design.pins / (design.pins - design.lobes));
      expect(cycloidalRatio(cycloidalVariantId(design.pins, design.lobes))?.ratio).toBe(pins);
    }

    const spec = cycloidalSpec(D6374, 15)!;

    expect(spec).toMatchObject({ stallNm: 66.82, ratedNm: 23.76, rpm: 240, atVolts: 24, bus: 'can' });
    expect(spec.armature).toBeCloseTo(2e-4 * 225, 9);
    expect(spec.source).toMatch(/^Estimate: .* 0\.9 efficiency/);
  });

  it('writes the 15:1 reduction into the knee’s MJCF forcerange and armature, leaving the position gear at 1', () => {
    const scene = made(biped(), 'l_knee', sizedDesign(D6374, 15, 66.82));
    const model = buildMjcf({
      parts: scene.parts,
      rig: buildRig(scene.joints, scene.parts),
      project: projectOf(scene),
      measures: placedMeasures(scene.parts),
      partTriangles: fixtureTriangles(scene.parts),
    });
    const joint = /<joint name="(j\d+_l_knee)"[^>]*armature="([\d.]+)"/.exec(model.xml)!;
    const actuator = new RegExp(`<position name="${joint[1]}"[^>]*/>`).exec(model.xml)![0];

    expect(Number(joint[2])).toBeCloseTo(0.045, 4);
    expect(actuator).toMatch(/forcerange="-66\.82 66\.82"/);
    expect(actuator).not.toMatch(/\bgear=/);
  });
});

describe('Make an Actuator', () => {
  it('passes the long-legged biped’s knee on Servo torque where its STS3215 fails', () => {
    const before = biped();

    expect(kneeItem(before)?.status).toBe('fail');
    expect(kneeItem(before)?.fix).toMatchObject({ kind: 'make-actuator', joint: 'l_knee' });

    const after = madeFromFix(before, 'l_knee');
    const knee = engineering(after).joints.find((l) => l.joint.id === 'l_knee')!;

    expect(kneeItem(after)).toBeUndefined();
    expect(knee.status).toBe('pass');
    expect(after.parts.some((p) => p.id === 'l_knee_servo')).toBe(false);

    const joint = after.joints.find((j) => j.id === 'l_knee')!;
    const named = (ids: string[] = []) => ids.map((id) => after.parts.find((p) => p.id === id)?.name);

    expect(named(joint.actuators)).toEqual(['ODrive D6374 150KV']);
    expect(named(joint.gearTrain)).toEqual(['Disc A', 'Disc B', 'Input Shaft', '6704 Bearing', '6704 Bearing']);
    expect(named(joint.child)).toContain('Output Ring');
  });

  it('never picks a lower ratio or a smaller motor for a higher peak load', () => {
    const picks = [1, 4, 8, 12, 16, 20, 30, 40, 48].map((loadNm) =>
      pickActuator({ loadNm, rmsNm: loadNm * 0.67 }, BED),
    );
    const pins = picks.map((p) => ('design' in p ? p.design.pins : Infinity));

    expect(pins).toEqual([...pins].sort((a, b) => a - b));
    expect(new Set(picks.flatMap((p) => ('design' in p ? [p.design.motor] : []))).size).toBe(1);
    expect(picks.at(-1)).toEqual({
      refusal: 'needs 120 N·m of stall, more than a 25:1 ODrive D6374 150KV gives (111 N·m).',
    });
  });

  it('never offers an actuator bigger than the bed, and says why', () => {
    const tiny: BedSize = { name: 'Tiny', width: 80, depth: 80, height: 80 };
    const loads: ActuatorLoads = { loadNm: 4, rmsNm: 3 };

    expect(pickActuator(loads, BED)).toHaveProperty('design');
    expect(pickActuator(loads, tiny)).toEqual({
      refusal: 'needs an actuator 89 mm across, bigger than the Tiny bed.',
    });
  });

  it('lists one motor, one driver and one encoder per generated actuator, and prints the rest', () => {
    const scene = madeFromFix(madeFromFix(biped(), 'l_knee'), 'r_knee');
    const bom = buildBom({
      parts: scene.parts,
      project: projectOf(scene),
      purchases: {},
      measures: placedMeasures(scene.parts),
    });
    const qty = (key: RegExp) => bom.lines.filter((l) => key.test(l.key)).reduce((s, l) => s + l.qty, 0);

    expect(qty(/^component:odrive-d6374\|cycloidal-/)).toBe(2);
    expect(qty(/^component:mjbots-moteus-r4$/)).toBe(2);
    expect(qty(/^component:adafruit-as5600$/)).toBe(2);
    expect(qty(/^hardware:bearing\|6704/)).toBe(4);
    expect(bom.printed.filter((p) => /^Disc [AB]$/.test(p.name))).toHaveLength(4);
  });

  it('gives the same actuator for the same inputs', () => {
    const loads: ActuatorLoads = { loadNm: 6, rmsNm: 4, peakNm: 9 };

    expect(pickActuator(loads, BED)).toEqual(pickActuator(loads, BED));
    expect(madeFromFix(biped(), 'l_knee')).toEqual(madeFromFix(biped(), 'l_knee'));
  });

  it('reloads a saved scene with the same spec', () => {
    const scene = madeFromFix(biped(), 'l_knee');
    const motorId = scene.joints.find((j) => j.id === 'l_knee')!.actuators![0];
    const motor = scene.parts.find((p) => p.id === motorId)!;
    const saved = JSON.parse(JSON.stringify(scene)) as Scene;
    const reloaded = saved.parts.find((p) => p.id === motorId)!;

    expect(actuatorOf(reloaded.componentId!, reloaded.componentVariant)).toEqual(
      actuatorOf(motor.componentId!, motor.componentVariant),
    );
    expect(actuatorOf(reloaded.componentId!, reloaded.componentVariant)?.stallNm).toBeGreaterThan(40);
  });
});
