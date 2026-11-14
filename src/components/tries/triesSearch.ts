import type { StoredTry } from '../../cases/storedTry';

export type SceneNames = ReadonlyMap<string, string>;

export interface RobotTries {
  robot: string;
  tries: StoredTry[];
}

const newestFirst = (a: StoredTry, b: StoredTry) => b.at.localeCompare(a.at);

export function tryMatches(stored: StoredTry, query: string, scenes: SceneNames): boolean {
  const q = query.trim().toLowerCase();

  if (!q) return true;

  return [stored.case?.name, stored.robot.name, stored.source, scenes.get(stored.sceneId)].some((field) =>
    field?.toLowerCase().includes(q),
  );
}

export const matchingTries = (tries: readonly StoredTry[], query: string, scenes: SceneNames) =>
  tries.filter((t) => tryMatches(t, query, scenes));

export function robotGroups(tries: readonly StoredTry[], focus: string | null = null): RobotTries[] {
  const byRobot = new Map<string, StoredTry[]>();

  for (const t of [...tries].sort(newestFirst)) {
    const list = byRobot.get(t.robot.name);

    if (list) list.push(t);
    else byRobot.set(t.robot.name, [t]);
  }

  const groups = [...byRobot].map(([robot, list]) => ({ robot, tries: list }));

  return [...groups.filter((g) => g.robot === focus), ...groups.filter((g) => g.robot !== focus)];
}

export function pagedGroups(groups: readonly RobotTries[], count: number): RobotTries[] {
  let left = count;

  return groups.flatMap((g) => {
    if (left <= 0) return [];

    const tries = g.tries.slice(0, left);

    left -= tries.length;

    return [{ robot: g.robot, tries }];
  });
}
