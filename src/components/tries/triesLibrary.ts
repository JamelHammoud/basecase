import { isGenerated, type TryRecord } from '../../cases/tries';

export interface RobotTries {
  robot: string;
  tries: TryRecord[];
}

const words = (t: TryRecord) => [t.robot.name, t.case?.name, t.source, ...(isGenerated(t) ? ['variation'] : [])];

export function matchTries(query: string) {
  const q = query.trim().toLowerCase();

  return (t: TryRecord) => !q || words(t).some((w) => w?.toLowerCase().includes(q));
}

export function robotGroups(tries: TryRecord[]): RobotTries[] {
  const groups = new Map<string, TryRecord[]>();

  for (const t of tries) {
    const group = groups.get(t.robot.name) ?? [];

    group.push(t);
    groups.set(t.robot.name, group);
  }

  return [...groups].map(([robot, list]) => ({ robot, tries: list })).sort((a, b) => a.robot.localeCompare(b.robot));
}

export interface Picked {
  ids: string[];
  anchor: string | null;
}

export interface Click {
  id: string;
  shift: boolean;
  toggle: boolean;
}

export function pick(order: string[], picked: Picked, { id, shift, toggle }: Click): Picked {
  const from = picked.anchor ? order.indexOf(picked.anchor) : -1;

  if (shift && from >= 0) {
    const to = order.indexOf(id);
    const range = order.slice(Math.min(from, to), Math.max(from, to) + 1);

    return { ids: [...new Set([...picked.ids, ...range])], anchor: picked.anchor };
  }

  if (!toggle) return { ids: [id], anchor: id };

  const has = picked.ids.includes(id);

  return { ids: has ? picked.ids.filter((x) => x !== id) : [...picked.ids, id], anchor: id };
}
