import { describe, expect, it } from 'vitest';
import { engineeringFindings } from '../readiness/findings';
import type { RobotJoint, ScenePart } from '../types/robotics';
import { runEngineering } from './engineering';
import { component, joint, part, project } from './engineering.fixtures';
import { SIM_MODEL_CHECK } from './engineeringSimModel';

const XL330 = 'dynamixel-xl330-m288';
const MG996R = 'towerpro-mg996r';

const arm = (servos: Record<string, string>, extra: ScenePart[] = []) => {
  const parts = [
    part('base', { dimensions: { width: 60, height: 20, depth: 60 } }),
    part('upper', { position: [0, 60, 0], dimensions: { width: 20, height: 80, depth: 20 } }),
    part('fore', { position: [0, 140, 0], dimensions: { width: 20, height: 80, depth: 20 } }),
    ...Object.entries(servos).map(([id, componentId]) => component(id, componentId, { position: [0, 20, 0] })),
    ...extra,
  ];
  const joints: RobotJoint[] = [
    joint('shoulder', {
      name: 'Shoulder',
      parent: ['base', ...(servos.shoulderServo ? ['shoulderServo'] : [])],
      child: ['upper'],
      origin: [0, 20, 0],
      range: [-90, 90],
      actuators: servos.shoulderServo ? ['shoulderServo'] : undefined,
    }),
    joint('elbow', {
      name: 'Elbow',
      parent: ['upper', ...(servos.elbowServo ? ['elbowServo'] : [])],
      child: ['fore'],
      origin: [0, 100, 0],
      range: [0, 120],
      actuators: servos.elbowServo ? ['elbowServo'] : undefined,
    }),
  ];

  return { parts, project: project({ joints }), measures: {}, servoOutputs: {} };
};

const simRow = (input: ReturnType<typeof arm>) => runEngineering(input).rows.find((r) => r.check === SIM_MODEL_CHECK);

describe('Simulation model check', () => {
  it('passes when every joint runs on a measured servo', () => {
    const row = simRow(arm({ shoulderServo: XL330, elbowServo: XL330 }));

    expect(row?.status).toBe('pass');
    expect(row?.items).toEqual([]);
  });

  it('flags a robot whose servo sits in the scene unassigned, and selects the joints it estimates', () => {
    const loose = component('loose', XL330, { position: [80, 10, 0] });
    const row = simRow(arm({ shoulderServo: XL330 }, [loose]))!;

    expect(row.status).toBe('warn');
    expect(row.detail).toBe('1 of 2 joints estimated');
    expect(row.items).toEqual([
      { text: 'Torque for 1 joint is estimated from weight. Assign servos for exact limits.', ids: ['fore'] },
    ]);
  });

  it('notes a servo with no measured response, selecting its servo', () => {
    const row = simRow(arm({ shoulderServo: XL330, elbowServo: MG996R }))!;

    expect(row.items).toEqual([{ text: 'Servo response for 1 joint is estimated.', ids: ['elbowServo'] }]);
  });

  it('turns each estimate into a note, never a blocker', () => {
    const report = runEngineering(arm({}));
    const notes = engineeringFindings(report).filter((f) => f.check === SIM_MODEL_CHECK);

    expect(notes.map((f) => [f.level, f.text, f.ids])).toEqual([
      ['note', 'Torque for 2 joints is estimated from weight. Assign servos for exact limits.', ['upper', 'fore']],
    ]);
    expect(notes[0].agentText).toMatch(/^Simulation model: Torque for 2 joints/);
  });

  it('counts published torque limits as estimated response', () => {
    const input = arm({});
    const joints = input.project.joints!.map((j) => ({ ...j, effortNm: 2 }));
    const row = simRow({ ...input, project: { ...input.project, joints } })!;

    expect(row.items?.map((i) => i.text)).toEqual(['Servo response for 2 joints is estimated.']);
  });

  it('has no row without movable joints', () => {
    expect(simRow({ ...arm({}), project: project() })).toBeUndefined();
  });
});
