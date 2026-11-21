import type { Rig } from '../utils/kinematics';
import { esc } from './mjcfText';
import type { SimBody } from './mjcfTypes';
import { declaredContactPairs, selfContactPairs, type ContactTopology, type SelfContactSettings } from './selfContact';

const ROBOT_BITS = 31;
const LAST_ROBOT_BIT = ROBOT_BITS - 1;

export function robotContactMasks(robots: Rig['robots'], config?: SelfContactSettings): Map<string, string> {
  const masks = new Map<string, string>();
  const all = robots.reduce((mask, _, i) => mask | (1 << (Math.min(i, LAST_ROBOT_BIT) + 1)), 0);

  robots.forEach((robot, i) => {
    const bit = 1 << (Math.min(i, LAST_ROBOT_BIT) + 1);
    const shared = robots.length > ROBOT_BITS && i >= LAST_ROBOT_BIT;
    const type = robots.length === 1 ? 1 : 1 | bit;
    const enabled = config?.[robot.key]?.enabled;
    const selfAffinity = shared || enabled ? all : all & ~bit;
    const affinity = robots.length === 1 && enabled ? 1 : selfAffinity;
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

export function robotContactExclusions(robots: Rig['robots'], bodies: SimBody[], topology?: ContactTopology): string {
  if (robots.length <= ROBOT_BITS && !robots.some((robot) => topology?.config?.[robot.key]?.enabled)) return '';

  const overflow = new Set(robots.slice(LAST_ROBOT_BIT).map((robot) => robot.key));
  const groups = new Map<string, SimBody[]>();

  for (const body of bodies) {
    if (!body.robot || (!overflow.has(body.robot) && !topology?.config?.[body.robot]?.enabled)) continue;

    const members = groups.get(body.robot) ?? [];

    members.push(body);
    groups.set(body.robot, members);
  }

  const exclusions = [...groups.entries()].flatMap(([key, members]) => {
    const setting = topology?.config?.[key];

    if (!setting?.enabled || !topology) return bodyExclusions(members);

    const declared = declaredContactPairs(members, setting);
    const pairs = [...selfContactPairs(members, topology), ...declared];
    const lines = pairs.map(([a, b]) => `    <exclude body1="${esc(a.name)}" body2="${esc(b.name)}"/>`);

    return [...new Set(lines)].sort();
  });

  return exclusions.length ? `  <contact>\n${exclusions.join('\n')}\n  </contact>\n` : '';
}
