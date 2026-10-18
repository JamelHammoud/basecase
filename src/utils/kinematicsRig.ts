import type { RobotJoint, ScenePart } from '../types/robotics';

export type V3 = [number, number, number];

export interface Rig {
  joints: RobotJoint[];
  byId: Map<string, RobotJoint>;
  parentOf: Map<string, string | null>;
  depth: Map<string, number>;
  ownerOf: Map<string, string>;
  chain: Map<string, Set<string>>;
  bodyParts: Set<string>;
  rootPivot: V3;
  robots: RobotGroup[];
  robotOf: Map<string, string>;
  parts: ScenePart[];
}

export interface RobotGroup {
  key: string;
  name: string;
  joints: string[];
  parts: Set<string>;
  pivot: V3;
}

export const isMovable = (j: RobotJoint) => j.type === 'revolute' || j.type === 'prismatic';

interface JointTree {
  byId: Map<string, RobotJoint>;
  childOf: Map<string, RobotJoint[]>;
  parentOf: Map<string, string | null>;
  depth: Map<string, number>;
  visiting: Set<string>;
}

function parentJointOf(tree: JointTree, j: RobotJoint): RobotJoint | null {
  const explicit = j.parentJoint ? tree.byId.get(j.parentJoint) : undefined;

  if (explicit && explicit !== j) return explicit;

  let best = -1;
  let parent: RobotJoint | null = null;

  for (const id of j.parent) {
    for (const k of tree.childOf.get(id) ?? []) {
      if (k === j || tree.visiting.has(k.id)) continue;

      const d = depthOf(tree, k);

      if (d > best) {
        best = d;
        parent = k;
      }
    }
  }

  return parent;
}

function depthOf(tree: JointTree, j: RobotJoint): number {
  const known = tree.depth.get(j.id);

  if (known !== undefined) return known;

  if (tree.visiting.has(j.id)) return 0;

  tree.visiting.add(j.id);

  const parent = parentJointOf(tree, j);
  const d = parent ? depthOf(tree, parent) + 1 : 0;

  tree.visiting.delete(j.id);
  tree.parentOf.set(j.id, parent?.id ?? null);
  tree.depth.set(j.id, d);

  return d;
}

function jointTree(joints: RobotJoint[]): JointTree {
  const childOf = new Map<string, RobotJoint[]>();

  for (const j of joints) for (const id of j.child) childOf.set(id, [...(childOf.get(id) ?? []), j]);

  const tree: JointTree = {
    byId: new Map(joints.map((j) => [j.id, j])),
    childOf,
    parentOf: new Map(),
    depth: new Map(),
    visiting: new Set(),
  };

  joints.forEach((j) => depthOf(tree, j));

  return tree;
}

function adoptGroupedPart(p: ScenePart, parts: ScenePart[], ownerOf: Map<string, string>, mounts: Set<string>) {
  const owners = new Set(
    parts
      .filter((q) => q.group?.id === p.group!.id && q.id !== p.id && (ownerOf.has(q.id) || mounts.has(q.id)))
      .map((q) => ownerOf.get(q.id) ?? 'base'),
  );
  const only = owners.size === 1 ? [...owners][0] : 'base';

  if (only !== 'base') ownerOf.set(p.id, only);
}

function partOwners(joints: RobotJoint[], parts: ScenePart[], tree: JointTree): Map<string, string> {
  const ownerOf = new Map<string, string>();

  for (const [partId, list] of tree.childOf) {
    const deepest = list.reduce((a, b) => ((tree.depth.get(b.id) ?? 0) > (tree.depth.get(a.id) ?? 0) ? b : a));

    ownerOf.set(partId, deepest.id);
  }

  const mounts = new Set<string>();

  for (const j of joints) {
    const above = tree.parentOf.get(j.id);

    for (const id of j.parent) {
      if (ownerOf.has(id) || mounts.has(id)) continue;

      mounts.add(id);

      if (above) ownerOf.set(id, above);
    }
  }

  for (const p of parts) {
    if (ownerOf.has(p.id) || mounts.has(p.id) || !p.group) continue;

    adoptGroupedPart(p, parts, ownerOf, mounts);
  }

  return ownerOf;
}

function jointChains(joints: RobotJoint[], parentOf: Map<string, string | null>): Map<string, Set<string>> {
  const chain = new Map<string, Set<string>>();

  for (const j of joints) {
    const set = new Set<string>();
    let at: string | null = j.id;

    while (at && !set.has(at)) {
      set.add(at);
      at = parentOf.get(at) ?? null;
    }

    chain.set(j.id, set);
  }

  return chain;
}

function unionFind() {
  const up = new Map<string, string>();
  const find = (x: string): string => {
    let r = x;

    while (up.has(r) && up.get(r) !== r) r = up.get(r)!;

    up.set(x, r);

    return r;
  };
  const join = (a: string, b: string) => {
    const ra = find(a),
      rb = find(b);

    if (ra !== rb) up.set(ra, rb);
  };

  return { up, find, join };
}

interface Members {
  joints: string[];
  parts: Set<string>;
}

type UnionFind = ReturnType<typeof unionFind>;

function joinJointsAndParts(joints: RobotJoint[], parentOf: Map<string, string | null>, ownerOf: Map<string, string>) {
  const uf = unionFind();

  for (const j of joints) {
    uf.find(`j:${j.id}`);

    const above = parentOf.get(j.id);

    if (above) uf.join(`j:${j.id}`, `j:${above}`);

    for (const id of [...j.parent, ...j.child]) uf.join(`j:${j.id}`, `p:${id}`);
  }

  for (const [partId, jointId] of ownerOf) uf.join(`p:${partId}`, `j:${jointId}`);

  return uf;
}

function adoptGroupedRobotParts(parts: ScenePart[], { up, find }: UnionFind) {
  const robotParts = new Set([...up.keys()].filter((k) => k.startsWith('p:')).map((k) => k.slice(2)));

  for (const p of parts) {
    if (robotParts.has(p.id) || !p.group || p.role === 'reference') continue;

    const comps = new Set(
      parts.filter((q) => q.group?.id === p.group!.id && robotParts.has(q.id)).map((q) => find(`p:${q.id}`)),
    );

    if (comps.size === 1) up.set(`p:${p.id}`, [...comps][0]);
  }
}

function collectMembers({ up, find }: UnionFind): Map<string, Members> {
  const members = new Map<string, Members>();

  for (const k of up.keys()) {
    const r = find(k);

    if (!members.has(r)) members.set(r, { joints: [], parts: new Set() });

    if (k.startsWith('j:')) members.get(r)!.joints.push(k.slice(2));
    else members.get(r)!.parts.add(k.slice(2));
  }

  return members;
}

function connectedMembers(
  joints: RobotJoint[],
  parts: ScenePart[],
  parentOf: Map<string, string | null>,
  ownerOf: Map<string, string>,
): Map<string, Members> {
  const uf = joinJointsAndParts(joints, parentOf, ownerOf);

  adoptGroupedRobotParts(parts, uf);

  return collectMembers(uf);
}

function robotGroup(
  m: Members,
  ordered: RobotJoint[],
  parentOf: Map<string, string | null>,
  byPart: Map<string, ScenePart>,
) {
  const ids = ordered.filter((j) => m.joints.includes(j.id));
  const base = ids.filter((j) => !parentOf.get(j.id));
  const pivotOf = base.length ? base : ids;
  const key = [...pivotOf.map((j) => j.id)].sort()[0];
  const groups = new Set([...m.parts].map((id) => byPart.get(id)?.group?.name).filter(Boolean));

  return {
    key,
    name: groups.size === 1 ? [...groups][0]! : 'Robot',
    joints: ids.map((j) => j.id),
    parts: m.parts,
    pivot: [0, 1, 2].map((i) => pivotOf.reduce((s, j) => s + j.origin[i], 0) / pivotOf.length) as V3,
  };
}

function numberDuplicateNames(robots: RobotGroup[]) {
  const seen = new Map<string, number>();

  for (const r of robots) {
    const n = (seen.get(r.name) ?? 0) + 1;

    seen.set(r.name, n);

    if (n > 1) r.name = `${r.name} ${n}`;
  }
}

function robotGroups(
  members: Map<string, Members>,
  ordered: RobotJoint[],
  parentOf: Map<string, string | null>,
  parts: ScenePart[],
) {
  const byPart = new Map(parts.map((p) => [p.id, p]));
  const robotOf = new Map<string, string>();
  const robots: RobotGroup[] = [];

  for (const m of members.values()) {
    if (!m.joints.length) continue;

    const group = robotGroup(m, ordered, parentOf, byPart);

    robots.push(group);
    group.joints.forEach((id) => robotOf.set(id, group.key));
    m.parts.forEach((id) => robotOf.set(id, group.key));
  }

  robots.sort((a, b) => a.key.localeCompare(b.key));
  numberDuplicateNames(robots);

  return { robots, robotOf };
}

export function buildRig(joints: RobotJoint[], parts: ScenePart[]): Rig {
  const tree = jointTree(joints);
  const { byId, parentOf, depth } = tree;
  const ownerOf = partOwners(joints, parts, tree);
  const chain = jointChains(joints, parentOf);
  const ordered = [...joints].sort((a, b) => (depth.get(a.id) ?? 0) - (depth.get(b.id) ?? 0));
  const members = connectedMembers(joints, parts, parentOf, ownerOf);
  const { robots, robotOf } = robotGroups(members, ordered, parentOf, parts);

  return {
    joints: ordered,
    byId,
    parentOf,
    depth,
    ownerOf,
    chain,
    bodyParts: new Set(robots.flatMap((r) => [...r.parts])),
    rootPivot: robots[0]?.pivot ?? [0, 0, 0],
    robots,
    robotOf,
    parts,
  };
}
