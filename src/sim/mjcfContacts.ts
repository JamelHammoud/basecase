import type { Rig } from '../utils/kinematics';
import { esc } from './mjcfText';
import type { SimBody } from './mjcfTypes';

const ROBOT_BITS = 31;
const LAST_ROBOT_BIT = ROBOT_BITS - 1;

export function robotContactMasks(robots: Rig['robots']): Map<string, string> {
  const masks = new Map<string, string>();
  const all = robots.reduce((mask, _, i) => mask | (1 << (Math.min(i, LAST_ROBOT_BIT) + 1)), 0);

  robots.forEach((robot, i) => {
    const bit = 1 << (Math.min(i, LAST_ROBOT_BIT) + 1);
    const shared = robots.length > ROBOT_BITS && i >= LAST_ROBOT_BIT;
    const type = robots.length === 1 ? 1 : 1 | bit;
    const affinity = shared ? all : all & ~bit;
    const attrs = `contype="${type}" conaffinity="${affinity}"`;

    for (const id of robot.parts) masks.set(id, attrs);
  });

  return masks;
}

function bodyExclusions(bodies: SimBody[]): string[] {
  return bodies.flatMap((body, i) =>
    bodies.slice(i + 1).map((other) => `    <exclude body1="${esc(body.name)}" body2="${esc(other.name)}"/>`),
  );
}

export function robotContactExclusions(robots: Rig['robots'], bodies: SimBody[]): string {
  if (robots.length <= ROBOT_BITS) return '';

  const overflow = new Set(robots.slice(LAST_ROBOT_BIT).map((robot) => robot.key));
  const groups = new Map<string, SimBody[]>();

  for (const body of bodies) {
    if (!body.robot || !overflow.has(body.robot)) continue;

    const members = groups.get(body.robot) ?? [];

    members.push(body);
    groups.set(body.robot, members);
  }

  return `  <contact>\n${[...groups.values()].flatMap(bodyExclusions).join('\n')}\n  </contact>\n`;
}
