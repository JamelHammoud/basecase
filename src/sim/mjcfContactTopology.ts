import type { ProjectSettings, RobotJoint } from '../types/robotics';
import type { Rig } from '../utils/kinematics';
import type { SimBody, SimJoint } from './mjcfTypes';
import type { ContactTopology } from './selfContact';
import { robotContactExclusions } from './mjcfContacts';
import { esc } from './mjcfText';

interface ContactState {
  input: { project: Pick<ProjectSettings, 'selfContact'> };
  bodies: SimBody[];
  simJoints: Pick<SimJoint, 'id'>[];
  loops: { coupler: Pick<RobotJoint, 'id'>; rocker: Pick<RobotJoint, 'id'> }[];
}

export function contactTopology(st: ContactState): ContactTopology {
  const byJoint = new Map(st.bodies.map((body) => [body.joint, body.name]));

  return {
    config: st.input.project.selfContact,
    movable: new Set(st.simJoints.map((joint) => joint.id)),
    closures: st.loops.flatMap((loop) => {
      const a = byJoint.get(loop.coupler.id);
      const b = byJoint.get(loop.rocker.id);

      return a && b ? [[a, b] as [string, string]] : [];
    }),
  };
}

export function contactFingerprint(robot: Rig['robots'][number], st: ContactState): string | undefined {
  if (!st.input.project.selfContact?.[robot.key]?.enabled) return undefined;

  const bodies = st.bodies.filter((body) => body.robot === robot.key);
  const identities = new Map(bodies.map((body) => [esc(body.name), esc(body.joint ? `joint:${body.joint}` : 'root')]));
  const exclusions = robotContactExclusions([robot], bodies, contactTopology(st));
  const stable = exclusions
    .replace(/body[12]="([^"]*)"/g, (attribute, name: string) => attribute.replace(name, identities.get(name) ?? name))
    .split('\n')
    .sort()
    .join('\n');

  return `self-contact\n${stable}`;
}
