import { specToPart, type AgentCadPayload } from '../agent/agentScene';
import type { DesignParameter } from '../utils/designParameters/types';
import type { RobotJoint, ScenePart } from '../types/robotics';
import { fingerFrame } from './frames';
import { fingerHardware } from './hardware';
import { readMount, readFinger } from './dimensions';
import { validateFingerAssembly } from './validation';
import type { FingerDimensions, FingerReference } from './types';

export interface FingerAssemblyJob {
  parts: ScenePart[];
  joints: RobotJoint[];
  target: string;
  mounts: Array<{ part: string; joint: string }>;
  dimensions: FingerDimensions;
  cad: AgentCadPayload;
  parameters: DesignParameter[];
}

export const FINGER_BINDINGS = [
  ['finger_length', 'finger_length'],
  ['finger_thickness', 'finger_thickness'],
  ['finger_clearance', 'finger_clearance'],
  ['mount_height', 'finger_mount_height'],
  ['mount_depth', 'finger_mount_depth'],
  ['mount_spacing', 'finger_mount_spacing'],
] as const;

const portablePart = (part: ScenePart): ScenePart => JSON.parse(JSON.stringify(part));

export function assembleFingers(job: FingerAssemblyJob) {
  const mounts = new Set(job.mounts.map((mount) => mount.part));
  const removed = new Set(
    job.parts.filter((part) => part.gripperFinger && mounts.has(part.gripperFinger.mount)).map((part) => part.id),
  );
  const parts = job.parts
    .filter((part) => !removed.has(part.id))
    .map((part) => {
      if (!job.mounts.some((mount) => mount.part === part.id)) return part;

      return portablePart({
        ...part,
        dimensionBindings: FINGER_BINDINGS.filter(([target]) => target.startsWith('mount_')).map(
          ([target, expression]) => ({ kind: 'cad' as const, target, expression, unit: 'mm' as const }),
        ),
      });
    });
  const children = new Map<string, string[]>();

  for (const mounting of job.mounts) {
    const mount = parts.find((part) => part.id === mounting.part)!;
    const joint = job.joints.find((item) => item.id === mounting.joint)!;
    const reference: FingerReference = {
      version: 1,
      role: 'finger',
      mount: mount.id,
      joint: joint.id,
      target: job.target,
      travel: [...joint.range!],
      axis: [...joint.axis],
    };
    const local = specToPart({
      id: `${mount.id}-finger`,
      name: `${mount.name} finger`,
      shape: 'cad_part',
      cad: job.cad,
    });
    const frame = fingerFrame(mount);
    const finger: ScenePart = {
      ...local,
      position: frame.at(local.position),
      rotation: [...mount.rotation],
      gripperFinger: reference,
      dimensionBindings: FINGER_BINDINGS.map(([target, expression]) => ({
        kind: 'cad',
        target,
        expression,
        unit: 'mm',
      })),
    };
    const hardware = fingerHardware(mount, job.dimensions, reference);

    const additions = [finger, ...hardware];
    const conflict = parts.find((part) => additions.some((addition) => addition.id === part.id));

    if (conflict) throw new Error(`Rename ${conflict.name} before fitting fingers.`);

    parts.push(...additions.map(portablePart));
    children.set(joint.id, [finger.id, ...hardware.map((part) => part.id)]);
  }

  const joints = job.joints.map((joint) =>
    children.has(joint.id)
      ? { ...joint, child: [...joint.child.filter((id) => !removed.has(id)), ...children.get(joint.id)!] }
      : joint,
  );

  validateFingerAssembly(parts, joints);

  return { parts, joints, parameters: job.parameters };
}

export function refreshFingerHardware(parts: ScenePart[]) {
  const patches = new Map<string, ScenePart>();

  for (const finger of parts.filter((part) => part.gripperFinger?.role === 'finger')) {
    const reference = finger.gripperFinger!;
    const mount = parts.find((part) => part.id === reference.mount);
    const dimensions = mount && readMount(mount);

    if (!mount || !dimensions) throw new Error('Restore the declared finger mount.');

    const current = readFingerDimensions(finger);

    for (const item of fingerHardware(mount, current, reference)) patches.set(item.id, item);
  }

  const refreshed = parts.map((part) => {
    if (patches.has(part.id))
      return portablePart({
        ...part,
        position: patches.get(part.id)!.position,
        rotation: patches.get(part.id)!.rotation,
      });

    return readFinger(part) || readMount(part) ? portablePart(part) : part;
  });

  validateFingerAssembly(refreshed);

  return refreshed;
}

function readFingerDimensions(part: ScenePart) {
  const dimensions = readFinger(part);

  if (!dimensions) throw new Error('Restore the declared finger geometry.');

  return dimensions;
}
