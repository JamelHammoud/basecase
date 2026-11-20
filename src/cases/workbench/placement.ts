import type { V3 } from '../../utils/kinematics';
import { caseSlots, type Case, type ProbeEnd, type ReferenceCommand, type WorldObject } from '../schema';
import { placementOf } from '../slots';
import { asNumber, asRecord, refuse, vector } from '../validate';

export interface WorkbenchPose {
  position: V3;
  yawDeg: number;
}

export function readWorkbenchPose(value: unknown): WorkbenchPose {
  const record = asRecord(value, 'Workbench placement');
  const position = vector(3)(record.position, 'Workbench position') as V3;
  const yawDeg = asNumber(record.yawDeg, 'Workbench yaw');

  if (Object.keys(record).some((key) => key !== 'position' && key !== 'yawDeg'))
    refuse('Workbench placement', 'supports position and yaw only');

  if (position.some((n) => Math.abs(n) > 100000) || Math.abs(yawDeg) > 360)
    refuse('Workbench placement', 'exceeds 100000 mm or 360 degrees');

  return { position, yawDeg };
}

export function placementFrame(entered: WorkbenchPose, pivot: V3) {
  const pose = readWorkbenchPose(entered);
  const frame = placementOf({ pose: { position: pivot, yawDeg: -pose.yawDeg } }, pose.position);
  const inverse = placementOf({ pose: { position: pose.position, yawDeg: pose.yawDeg } }, pivot);

  return { ...frame, id: (id: string) => id, inverse: inverse.at };
}

function supported(command: ReferenceCommand): boolean {
  const aux = command.aux ?? [];

  return (
    !Object.keys(command).some((key) => !['at', 'slot', 'v', 'target', 'aux', 'joints', 'push'].includes(key)) &&
    aux.length <= 2 &&
    !command.joints &&
    !command.push &&
    !(command.v ?? []).some((n) => n !== 0) &&
    !aux.some((n, i) => i !== 1 && n !== 0) &&
    (aux[1] === undefined || (aux[1] >= 0 && aux[1] <= 1)) &&
    (!!command.target || aux.length > 1)
  );
}

export function relocationRefusal(kase: Case): string | null {
  const slots = caseSlots(kase);

  if (slots.length !== 1 || !slots[0].needs.includes('arm')) return 'Choose a Case for one fixed arm.';

  if (kase.world.imported || kase.logic || kase.world.objects.some((object) => object.movable))
    return 'Use a Case without imported worlds or scripted motion.';

  if (
    kase.reference.timeline.some(
      (command) => !Number.isFinite(command.at) || command.at < 0 || command.at >= kase.task.seconds,
    )
  )
    return 'Keep reference commands within the Case duration.';

  if (!kase.reference.timeline.length || kase.reference.timeline.some((command) => !supported(command)))
    return 'Workbench rehearsal supports Cartesian targets and grip commands. Replace joint or velocity commands.';

  return null;
}

export function relocateCase(kase: Case, entered: WorkbenchPose, pivot: V3): Case {
  const frame = placementFrame(entered, pivot);
  const probeEnd = (end: ProbeEnd): ProbeEnd =>
    typeof end === 'object' && 'point' in end ? { point: frame.at(end.point) } : end;
  const object = (own: WorldObject): WorldObject => ({
    ...own,
    position: frame.at(own.position),
    rotation: frame.rotate(own.rotation),
    ...(own.joint
      ? { joint: { ...own.joint, origin: frame.at(own.joint.origin), axis: frame.turn(own.joint.axis) } }
      : {}),
  });

  return {
    ...kase,
    ...(kase.slots
      ? { slots: kase.slots.map((slot) => ({ ...slot, reachMm: undefined, anchor: undefined })) }
      : { slot: { ...kase.slot!, reachMm: undefined, anchor: undefined } }),
    world: { ...kase.world, objects: kase.world.objects.map(object) },
    reference: {
      timeline: kase.reference.timeline.map((command) => ({
        ...command,
        ...(command.target ? { target: frame.at(command.target) } : {}),
      })),
    },
    task: {
      ...kase.task,
      probes: kase.task.probes.map((probe) => ({ ...probe, from: probeEnd(probe.from), to: probeEnd(probe.to) })),
    },
  };
}
