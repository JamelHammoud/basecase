import { describe, expect, it } from 'vitest';
import type { HardwareSpec } from '../data/hardware';
import { jointMap } from '../sim/robotPackage/jointMap';
import type { ProjectSettings, RobotJoint, ScenePart } from '../types/robotics';
import { buildAlongSteps } from './buildAlong';
import { buildGuidePlan, isBuilt } from './guidePlan';
import { approximateScene } from './guideScene';

type V3 = [number, number, number];

const part = (id: string, y: number, height: number, o: Partial<ScenePart> = {}): ScenePart => ({
  id,
  name: id,
  kind: 'cad_part',
  category: 'structure',
  role: 'solid',
  position: [0, y + height / 2, 0],
  rotation: [0, 0, 0],
  dimensions: { width: 40, height, depth: 40 },
  color: '#eeeeee',
  note: '',
  visible: true,
  locked: false,
  ...o,
});

const servo = (id: string, y: number) =>
  part(id, y, 40, { name: 'Feetech STS3215', kind: 'component', componentId: 'feetech-sts3215' });

const screw = (id: string, at: V3): ScenePart => ({
  ...part(id, 0, 11),
  position: at,
  dimensions: { width: 5.5, height: 11, depth: 5.5 },
  kind: 'hardware',
  hardware: { type: 'socket_head', size: 'M3', length: 6 } as HardwareSpec,
});

const parts: ScenePart[] = [
  part('base', 0, 20, { name: 'Base', dimensions: { width: 80, height: 20, depth: 80 } }),
  screw('base-screw-a', [15, 20, 15]),
  screw('base-screw-b', [-15, 20, -15]),
  servo('pan-servo', 20),
  part('upper-arm', 60, 60, { name: 'Upper Arm' }),
  servo('lift-servo', 120),
  part('forearm', 160, 60, { name: 'Forearm' }),
  servo('elbow-servo', 220),
  part('wrist', 260, 30, { name: 'Wrist' }),
  part('label', 300, 2, { kind: 'image_plane' }),
];

const joint = (id: string, name: string, o: Partial<RobotJoint>): RobotJoint => ({
  id,
  name,
  type: 'revolute',
  parent: [],
  child: [],
  origin: [0, 0, 0],
  axis: [0, 1, 0],
  limb: 'arm',
  ...o,
});

const joints: RobotJoint[] = [
  joint('mount', 'Mount', { type: 'fixed', parent: ['base'], child: ['pan-servo'] }),
  joint('pan', 'Shoulder pan', { parent: ['base'], child: ['upper-arm'], actuators: ['pan-servo'] }),
  joint('lift', 'Shoulder lift', { parent: ['upper-arm'], child: ['forearm'], actuators: ['lift-servo'] }),
  joint('elbow', 'Elbow', { parent: ['forearm'], child: ['wrist'], actuators: ['elbow-servo'] }),
];

const project: ProjectSettings = { printer: 'bambu-p1s', material: 'PETG', infillPct: 15, joints };

const plan = () => buildGuidePlan(approximateScene('Arm', parts, joints), 'PETG');

describe('Build Along', () => {
  it('only adds parts from step to step and ends with every built part', () => {
    const steps = buildAlongSteps(plan(), joints);

    expect(steps.length).toBeGreaterThan(2);
    steps.slice(1).forEach((step, i) => expect(step.shown).toEqual(expect.arrayContaining(steps[i].shown)));
    expect(new Set(steps.at(-1)!.shown)).toEqual(new Set(parts.filter(isBuilt).map((p) => p.id)));
    expect(steps.flatMap((s) => s.shown)).not.toContain('label');
  });

  it('shows the step’s own parts, its moves and the counts the guide prints', () => {
    const p = plan();
    const steps = buildAlongSteps(p, joints);

    p.steps.forEach((step, i) => {
      expect(steps[i].shown).toEqual(expect.arrayContaining([...step.partIds, ...step.contextIds]));
      expect(steps[i].moves).toBe(step.moves);
      expect(steps[i].callout.map((c) => c.qty)).toEqual(step.callout.map((c) => c.qty));
    });
    expect(steps.flatMap((s) => s.callout)).toContainEqual({ qty: 2, name: 'M3 × 6 Socket Head Screw' });
  });

  it('names each servo’s joint and the bus ID the joint map gives it', () => {
    const steps = buildAlongSteps(plan(), joints);
    const servos = steps.flatMap((s) => s.servos);
    const map = jointMap({ model: { joints: [], robots: [] }, project, parts, name: 'Arm' });

    expect(servos.map((s) => s.partId).sort()).toEqual(['elbow-servo', 'lift-servo', 'pan-servo']);

    for (const servo of servos) {
      const owner = joints.find((j) => j.actuators?.includes(servo.partId))!;

      expect(servo.joint).toBe(owner.name);
      expect(map.joints.find((e) => e.joint === owner.name)?.id).toBe(servo.id);
    }

    expect(servos.find((s) => s.partId === 'lift-servo')?.id).toBe(2);
  });
});
