import { describe, expect, it } from 'vitest';
import { actuatorOf } from '../data/components';
import { fixtureTriangles } from '../sim/fixtures/parts';
import { fallBiped } from '../sim/fixtures/fallBiped';
import { buildMjcf } from '../sim/mjcf';
import { buildBom } from '../utils/bom';
import { buildRig } from '../utils/kinematics';
import { buildActuator, type ActuatorScene } from './actuatorBuild';
import { choiceOf } from './actuatorFix';
import { engineeringOf, loadedBiped, projectOf, worldMeasures } from './fixtures/loadedBiped';

const torque = (scene: ActuatorScene) => engineeringOf(scene).rows.find((r) => r.check === 'Servo torque')!;
const kneeItem = (scene: ActuatorScene) => torque(scene).items?.find((i) => i.text.startsWith('Left knee'));
const status = (scene: ActuatorScene, id: string) => engineeringOf(scene).joints.find((l) => l.joint.id === id)!.status;

function makeActuator(scene: ActuatorScene, joint: string) {
  const fix = engineeringOf(scene)
    .rows.flatMap((r) => r.items ?? [])
    .find((i) => i.fix?.kind === 'make-actuator' && i.fix.joint === joint)?.fix;

  if (fix?.kind !== 'make-actuator') throw new Error(`no actuator offered for ${joint}`);

  return buildActuator(scene, joint, choiceOf(fix)!)!;
}

const D6374_15 = { motor: 'odrive-d6374', driver: 'moteus-r4', ratio: 15 };

describe('Make an Actuator', () => {
  it('passes the loaded biped’s knee that fails Servo torque on an STS3215', () => {
    const before = loadedBiped();

    expect(kneeItem(before)).toMatchObject({ status: 'fail', fix: { kind: 'make-actuator', joint: 'l_knee' } });

    const after = makeActuator(before, 'l_knee');

    expect(after.removed).toBe('l_knee_servo');
    expect(after.parts.some((p) => p.id === 'l_knee_servo')).toBe(false);
    expect(after.joints.find((j) => j.id === 'l_knee')!.actuators).toEqual([after.motorId]);
    expect(status(after, 'l_knee')).toBe('pass');
    expect(kneeItem(after)).toBeUndefined();
  });

  it('powers the actuator from the supply the servos share, and refuses a supply below its driver', () => {
    const after = makeActuator(loadedBiped(), 'l_knee');
    const row = (scene: ActuatorScene, check: string) => engineeringOf(scene).rows.find((r) => r.check === check)!;
    const smallBiped = fallBiped('c001', 3000);

    expect(row(after, 'Servo voltage')).toMatchObject({ status: 'pass', detail: expect.stringContaining('10–48 V') });
    expect(row(after, 'Supply current').detail).not.toBe(row(loadedBiped(), 'Supply current').detail);
    expect(kneeItem(smallBiped)).toMatchObject({
      status: 'fail',
      text: expect.stringContaining('not the 7.4 V supply'),
    });
    expect(kneeItem(smallBiped)).not.toHaveProperty('fix');
  });

  it('writes the knee’s gear, force range and reflected armature into the MJCF', () => {
    const scene = buildActuator(loadedBiped(), 'l_knee', choiceOf(D6374_15)!)!;
    const motor = scene.parts.find((p) => p.id === scene.motorId)!;
    const spec = actuatorOf(motor.componentId!, motor.componentVariant)!;
    const model = buildMjcf({
      parts: scene.parts,
      rig: buildRig(scene.joints, scene.parts),
      project: projectOf(scene),
      measures: worldMeasures(scene.parts),
      partTriangles: fixtureTriangles(scene.parts),
    });
    const knee = model.joints.find((j) => j.id === 'l_knee')!;
    const name = knee.name;

    expect(spec).toMatchObject({ stallNm: 66.99, ratedNm: 23.82, armature: 0.02475, rpm: 240 });
    expect(knee).toMatchObject({ effort: 66.99, effortSource: 'servo' });
    expect(model.xml).toMatch(new RegExp(`<joint name="${name}"[^>]* armature="0\\.02475"`));
    expect(model.xml).toMatch(new RegExp(`<position name="${name}"[^>]* forcerange="-66\\.99 66\\.99"`));
    expect(model.xml).not.toMatch(new RegExp(`<position name="${name}"[^>]* gear=`));
  });

  it('lists one motor, one driver and one encoder per actuator, the bearings and screws, and prints the rest', () => {
    const one = makeActuator(loadedBiped(), 'l_knee');
    const both = makeActuator(one, 'r_knee');
    const bom = buildBom({
      parts: both.parts,
      project: projectOf(both),
      purchases: {},
      measures: worldMeasures(both.parts),
    });
    const qty = (key: RegExp) => bom.lines.filter((l) => key.test(l.key)).reduce((s, l) => s + l.qty, 0);

    expect(qty(/^component:odrive-d6374\|cycloidal-/)).toBe(2);
    expect(qty(/^component:mjbots-moteus-/)).toBe(2);
    expect(qty(/^component:adafruit-as5600$/)).toBe(2);
    expect(qty(/^hardware:bearing\|6804\|/)).toBe(4);
    expect(qty(/^hardware:bearing\|6806\|/)).toBe(2);
    expect(qty(/^hardware:button_head\|M4\|8\|/)).toBe(8);
    expect(qty(/^hardware:socket_head\|M3\|14\|/)).toBe(12);
    expect(qty(/^hardware:heat_insert\|M3\|/)).toBe(12);
    expect(bom.printed.map((p) => p.name).filter((n) => n.startsWith('Disc'))).toEqual([
      'Disc 1',
      'Disc 2',
      'Disc 1',
      'Disc 2',
    ]);
  });

  it('replaces the whole actuator when the joint already has one', () => {
    const once = makeActuator(loadedBiped(), 'l_knee');
    const twice = buildActuator(once, 'l_knee', choiceOf(D6374_15)!)!;
    const housings = twice.parts.filter((p) => p.name === 'Housing');
    const ids = new Set(twice.parts.map((p) => p.id));
    const knee = twice.joints.find((j) => j.id === 'l_knee')!;

    expect(twice.parts).toHaveLength(once.parts.length);
    expect(housings).toHaveLength(1);
    expect(twice.removed).toBe(once.motorId);
    expect(twice.joints.flatMap((j) => [...j.parent, ...j.child]).every((id) => ids.has(id))).toBe(true);
    expect(knee.actuators).toEqual([twice.motorId]);
    expect(twice.parts.find((p) => p.id === twice.motorId)!.componentVariant).toBe('cycloidal-15-moteus-r4');
  });

  it('gives the same actuator for the same scene and joint', () => {
    expect(makeActuator(loadedBiped(), 'l_knee')).toEqual(makeActuator(loadedBiped(), 'l_knee'));
  });

  it('reloads a saved scene with the same actuator spec', () => {
    const built = makeActuator(loadedBiped(), 'l_knee');
    const saved: ActuatorScene = JSON.parse(JSON.stringify({ parts: built.parts, joints: built.joints }));
    const motorOf = (s: ActuatorScene) => s.parts.find((p) => p.id === built.motorId)!;
    const specOf = (s: ActuatorScene) => actuatorOf(motorOf(s).componentId!, motorOf(s).componentVariant);

    expect(specOf(saved)).toEqual(specOf(built));
    expect(engineeringOf(saved).joints).toEqual(engineeringOf(built).joints);
  });
});
