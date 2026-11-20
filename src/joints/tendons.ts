import { actuatorOf } from '../data/components';
import type { ProjectSettings, RobotJoint, ScenePart } from '../types/robotics';
import type { IdealTendon, TendonTerm } from '../types/tendon';
import { buildRig, type Rig } from '../utils/kinematics';
import { assertJointActuation } from './actuation';

export interface TendonEdit {
  motor: string;
  tendon: IdealTendon | null;
}

const bounded = (value: number, limit: number) => Number.isFinite(value) && Math.abs(value) <= limit;
const coefficient = (value: number) => bounded(value, 10000) && (value === 0 || Math.abs(value) >= 0.000001);

function lawProblem(tendon: IdealTendon): boolean {
  const law = tendon.law;

  if (law.kind === 'fixed') return !bounded(law.lengthMm, 100000);

  if (law.kind !== 'elastic') return true;

  return (
    !bounded(law.restLengthMm, 100000) ||
    law.restLengthMm === -1000 ||
    !bounded(law.stiffnessNPerMm, 10000) ||
    law.stiffnessNPerMm <= 0 ||
    !bounded(law.dampingNsPerMm, 1000) ||
    law.dampingNsPerMm < 0
  );
}

function termProblem(term: TendonTerm, motor: RobotJoint, rig: Rig, parts: Map<string, ScenePart>): boolean {
  const joint = rig.byId.get(term.joint);

  if (!joint || joint.type === 'fixed' || joint.loop || joint.actuation !== 'passive') return true;

  return (
    rig.robotOf.get(joint.id) !== rig.robotOf.get(motor.id) ||
    [...joint.parent, ...joint.child].some((id) => !parts.has(id)) ||
    !coefficient(term.coefficient) ||
    term.unit !== (joint.type === 'revolute' ? 'mm/rad' : 'mm/mm')
  );
}

function motorProblem(motor: RobotJoint, parts: Map<string, ScenePart>): boolean {
  const part = motor.actuators?.length === 1 ? parts.get(motor.actuators[0]) : undefined;

  if (!part?.componentId) return true;

  return (
    motor.type !== 'revolute' ||
    motor.actuation === 'passive' ||
    !!motor.loop ||
    !motor.range ||
    !motor.range.every(Number.isFinite) ||
    motor.range[0] >= motor.range[1] ||
    !actuatorOf(part.componentId, part.componentVariant)
  );
}

function assertTendon(motor: RobotJoint, rig: Rig, parts: Map<string, ScenePart>) {
  const tendon = motor.tendon!;

  if (
    motorProblem(motor, parts) ||
    !rig.robotOf.has(motor.id) ||
    [...motor.parent, ...motor.child].some((id) => !parts.has(id))
  )
    throw new Error(`${motor.id}: choose one catalog motor with a bounded hinge for the tendon`);

  if (
    tendon.spool.unit !== 'mm/rad' ||
    !coefficient(tendon.spool.coefficient) ||
    Math.abs(tendon.spool.coefficient) < 0.01 ||
    Math.abs(tendon.spool.coefficient) > 1000
  )
    throw new Error(`${motor.id}: use a signed tendon spool coefficient from 0.01 to 1000 mm/rad`);

  if (
    tendon.terms.length < 1 ||
    tendon.terms.length > 32 ||
    new Set(tendon.terms.map((t) => t.joint)).size !== tendon.terms.length ||
    !tendon.terms.some((term) => term.coefficient !== 0) ||
    tendon.terms.some((term) => termProblem(term, motor, rig, parts))
  )
    throw new Error(
      `${motor.id}: name distinct passive tendon joints on this robot with finite coefficients and matching units`,
    );

  if (lawProblem(tendon)) throw new Error(`${motor.id}: declare a bounded tendon length constraint or elastic law`);
}

export function assertTendons(rig: Rig, parts: ScenePart[]) {
  const motors = rig.joints.filter((joint) => joint.tendon);

  if (!motors.length) return;

  assertJointActuation(rig.joints);

  if (motors.length > 64 || new Set(rig.joints.map((j) => j.id)).size !== rig.joints.length)
    throw new Error('Use distinct joint identities and at most 64 tendon motors.');

  const byId = new Map(parts.map((part) => [part.id, part]));
  const uses = new Map<string, number>();

  for (const joint of rig.joints) for (const id of joint.actuators ?? []) uses.set(id, (uses.get(id) ?? 0) + 1);

  if (motors.some((motor) => motor.actuators?.some((id) => uses.get(id) !== 1)))
    throw new Error('Assign each tendon motor to its spool joint only.');

  for (const motor of motors) assertTendon(motor, rig, byId);
}

export function withTendons(
  project: ProjectSettings,
  parts: ScenePart[],
  edits: TendonEdit[],
): ProjectSettings & { joints: RobotJoint[] } {
  const changes = new Map(edits.map((edit) => [edit.motor, edit.tendon]));
  const ids = new Set((project.joints ?? []).map((joint) => joint.id));

  if (changes.size !== edits.length || edits.some((edit) => !ids.has(edit.motor)))
    throw new Error('Name each tendon motor once using an existing joint.');

  const joints = (project.joints ?? []).map((joint) => {
    if (!changes.has(joint.id)) return joint;

    const rest = { ...joint };

    delete rest.tendon;

    const tendon = changes.get(joint.id);

    return tendon ? { ...rest, tendon: structuredClone(tendon) } : rest;
  });

  assertTendons(buildRig(joints, parts), parts);

  return { ...project, joints };
}
