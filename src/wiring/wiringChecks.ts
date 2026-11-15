import type { CheckRow } from '../utils/engineeringTypes';
import { plural } from '../../electron/plural.mjs';
import { CONNECTOR_NAMES } from './connectors';
import type { Net, Netlist } from './netlist';
import { lengthLabel, signedLengthLabel } from '../utils/size';
import { angle } from '../utils/angle';
import type { RobotJoint } from '../types/robotics';

export const SERVO_BUS_CHECK = 'Servo bus';
export const CABLE_REACH_CHECK = 'Cable reach';

function busRows(netlist: Netlist): CheckRow[] {
  const items = netlist.buses.flatMap((bus) => {
    const ids = bus.servos.map((s) => s.id).filter((id) => netlist.unmatched.includes(id));

    return ids.length
      ? [{ text: `Add a ${CONNECTOR_NAMES[bus.connector]} bus adapter for ${plural(ids.length, 'servo')}.`, ids }]
      : [];
  });

  if (!items.length) return [];

  return [
    {
      check: SERVO_BUS_CHECK,
      status: 'fail',
      detail: items.map((i) => i.text).join(' '),
      ids: items.flatMap((i) => i.ids),
      items,
    },
  ];
}

function poseLabel(id: string, value: number, joints: RobotJoint[]) {
  const joint = joints.find((item) => item.id === id);
  const travel = joint?.type === 'prismatic' ? signedLengthLabel(value) : angle(value);

  return `${joint?.name ?? id}: ${travel}`;
}

function routeDetail(net: Net, joints: RobotJoint[]): string {
  const route = net.route!;
  const label = `${net.from.name} to ${net.to.name}`;
  const measured = route.requiredMm === null ? '' : `needs ${lengthLabel(route.requiredMm)}`;
  const cable = route.lengthMm === null ? '' : `${lengthLabel(route.lengthMm)} cable`;
  const pose = Object.entries(route.limitingPose)
    .map(([id, value]) => poseLabel(id, value, joints))
    .join(', ');
  const detail = [measured, cable, pose, route.reason].filter(Boolean).join(', ');

  return `${label}: ${detail}`;
}

function reachRows(netlist: Netlist, joints: RobotJoint[]): CheckRow[] {
  const nets = [...netlist.buses.flatMap((bus) => bus.nets), ...netlist.power.nets].filter((net) => net.route);

  if (!nets.length) return [];

  const failed = nets.filter((net) => net.route!.status !== 'pass');
  const longestMm = Math.max(...nets.map((net) => net.route!.requiredMm ?? 0));
  const items = failed.map((net) => ({
    text: routeDetail(net, joints),
    ids: [net.from.id, net.to.id].filter((id): id is string => !!id),
    status: 'fail' as const,
    joint: Object.keys(net.route!.limitingPose)[0],
  }));

  return [
    {
      check: CABLE_REACH_CHECK,
      status: items.length ? 'fail' : 'pass',
      detail: items.length ? items.map((item) => item.text).join('. ') : `Longest route: ${lengthLabel(longestMm)}`,
      ids: [...new Set(items.flatMap((item) => item.ids))],
      items,
    },
  ];
}

export function wiringRows(netlist: Netlist, joints: RobotJoint[] = []): CheckRow[] {
  return [...busRows(netlist), ...reachRows(netlist, joints)];
}
