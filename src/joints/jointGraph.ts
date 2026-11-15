interface JointEdge {
  a: string;
  b: string;
}

interface Neighbour<T> {
  next: string;
  joint?: T;
}

interface Walk<T> {
  adjacent: Map<string, Neighbour<T>[]>;
  seen: Set<string>;
  order: T[];
}

function append<T>(adjacent: Walk<T>['adjacent'], at: string, neighbour: Neighbour<T>) {
  const known = adjacent.get(at);

  if (known) known.push(neighbour);
  else adjacent.set(at, [neighbour]);
}

function connections<T extends JointEdge>(joins: T[], fixed: Array<[string, string]>): Walk<T>['adjacent'] {
  const adjacent: Walk<T>['adjacent'] = new Map();

  for (const joint of joins) {
    const { a, b } = joint;

    append(adjacent, a, { next: b, joint });
    append(adjacent, b, { next: a, joint });
  }

  for (const [a, b] of fixed) {
    append(adjacent, a, { next: b });
    append(adjacent, b, { next: a });
  }

  return adjacent;
}

function step<T extends JointEdge>(walk: Walk<T>, at: string, queue: string[]) {
  for (const { next, joint } of walk.adjacent.get(at) ?? []) {
    if (walk.seen.has(next)) continue;

    walk.seen.add(next);
    queue.push(next);

    if (joint) walk.order.push({ ...joint, a: at, b: next });
  }
}

export function orientJointGraph<T extends JointEdge>(
  roots: string[],
  joins: T[],
  fixed: Array<[string, string]>,
): T[] {
  const walk: Walk<T> = { adjacent: connections(joins, fixed), seen: new Set(), order: [] };

  for (const root of roots) {
    if (walk.seen.has(root) || !walk.adjacent.has(root)) continue;

    walk.seen.add(root);

    const queue = [root];

    for (let i = 0; i < queue.length; i++) step(walk, queue[i], queue);
  }

  return walk.order;
}
