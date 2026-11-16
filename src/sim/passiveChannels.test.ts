import { describe, expect, it } from 'vitest';
import { fixtureModel } from '../skills/fixtureModels';
import { kitEnvironment } from '../skills/kitEnvironment';
import { validateEnvironment } from '../skills/environment';
import { modelHashes } from '../skills/artifacts';
import { kitJob } from '../skills/kitJob';
import { runEngineering } from '../utils/engineering';
import { fixtureMeasures } from './fixtures/parts';
import { buildRig } from '../utils/kinematics';
import { wheelSetups } from './driveSetup';
import { passiveMechanism, passiveMechanisms } from './fixtures/passiveMechanisms';
import { trainingJob } from './trainingJob';
import { LegsDrive, footPoints } from './driveLegs';
import { fixtureRobots } from './fixtures/robots';
import { actuatorDefaults } from './actuatorChannels';

const options = { task: 'stand' as const, minutes: 1, command: [0, 0, 0] as [number, number, number] };

const mixedModel = () => {
  const model = fixtureModel('quad-servo');
  let actuator = 0;

  return { ...model, joints: model.joints.map((j, i) => ({ ...j, actuator: i % 3 === 1 ? -1 : actuator++ })) };
};

describe('physical state and control channels', () => {
  it('keeps powered channel order with interleaved passive joints and reversed physical metadata', () => {
    const model = mixedModel();
    const reversed = { ...model, joints: model.joints.toReversed() };
    const values = Object.fromEntries(model.joints.map((j, i) => [j.id, i + 1]));

    model.initial.values = values;

    const initial = (j: (typeof model.joints)[number]) => values[j.id] * (Math.PI / 180);
    const job = trainingJob(model, model.robots[0].key, options, 'Mixed');
    const again = trainingJob(reversed, model.robots[0].key, options, 'Mixed');

    expect(job.ctrlDefault).toEqual(actuatorDefaults(model.joints, initial));
    expect(again.ctrlDefault).toEqual(job.ctrlDefault);
    expect(job.joints.map((j) => j.id)).toEqual(model.joints.filter((j) => j.actuator >= 0).map((j) => j.id));
    expect(Object.keys(job.initialJoints)).toHaveLength(model.joints.length);
    expect(kitJob(model, 'stand', { minutes: 1, seed: 1 }).ctrlDefault).toEqual(job.ctrlDefault);
  });

  it('permits passive observations but refuses a passive action and changes actuator evidence', async () => {
    const before = fixtureModel('quad-servo');
    const model = mixedModel();
    const environment = kitEnvironment(model, 'stand');
    const passive = model.joints.find((j) => j.actuator < 0)!.id;

    expect(modelHashes(model).actuators).not.toBe(modelHashes(before).actuators);
    expect(
      await validateEnvironment(
        { ...environment, observation: [...environment.observation, { kind: 'joint-positions', joints: [passive] }] },
        model,
      ),
    ).toEqual([]);

    const problems = await validateEnvironment(
      { ...environment, action: { ...environment.action, joints: [passive] } },
      model,
    );

    expect(problems.some((p) => p.includes('The action names'))).toBe(true);
  });

  it('keeps passive coordinates out of live gait commands', () => {
    const fixture = fixtureRobots().find((robot) => robot.id === 'quad-servo')!;
    const passive = fixture.joints[0].id;
    const joints = fixture.joints.map((j) => (j.id === passive ? { ...j, actuation: 'passive' as const } : j));
    const rig = buildRig(joints, fixture.parts);
    const drive = new LegsDrive({
      kind: 'legs',
      robot: rig.robots[0].key,
      rig,
      feet: footPoints(rig, fixture.parts),
      start: {},
    });

    expect(drive.tick(0).values).not.toHaveProperty(passive);
    drive.command({ v: [0.5, 0, 0] });
    expect(drive.tick(0.02).values).not.toHaveProperty(passive);
  });

  it('does not ask for motors in passive-only engineering checks or live wheel mappings', () => {
    const { parts, project } = passiveMechanism(passiveMechanisms[2]);
    const report = runEngineering({ parts, project, measures: fixtureMeasures(parts), servoOutputs: {} });

    expect(report.joints).toEqual([]);
    expect(report.rows.some((row) => row.check === 'Torque estimates')).toBe(false);

    const named = project.joints.map((j) => ({ ...j, name: 'Caster wheel' }));

    expect(wheelSetups(buildRig(named, parts), parts)).toEqual([]);

    const contradictory = { ...project, joints: project.joints.map((j) => ({ ...j, actuators: ['base'] })) };
    const refused = runEngineering({
      parts,
      project: contradictory,
      measures: fixtureMeasures(parts),
      servoOutputs: {},
    });

    expect(refused.rows).toContainEqual(
      expect.objectContaining({ check: 'Joint parts', status: 'fail', detail: expect.stringContaining('passive') }),
    );
  });
});
