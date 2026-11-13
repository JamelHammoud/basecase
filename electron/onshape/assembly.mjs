import * as THREE from 'three';
import { frameOf, JOINT_TYPES, jointFrame, mateGroupsOf, matesOf } from './mates.mjs';
import { partKey, pathKey } from './occurrences.mjs';

const MM_TO_M = new THREE.Matrix4().makeScale(0.001, 0.001, 0.001);
const IDENTITY = new THREE.Matrix4().toArray();

function unionFind(keys) {
  const parent = new Map(keys.map((k) => [k, k]));
  const find = (k) => {
    let root = k;

    while (parent.get(root) !== root) root = parent.get(root);

    parent.set(k, root);

    return root;
  };

  return { find, union: (a, b) => parent.set(find(a), find(b)) };
}

function rigidGroups(parts, mates, features) {
  const groups = unionFind([...parts.keys()]);
  const known = (key) => parts.has(key);

  for (const m of mates)
    if (m.type === 'FASTENED' && m.ends.every((e) => known(e.path))) groups.union(...m.ends.map((e) => e.path));

  for (const members of mateGroupsOf(features)) {
    const inside = members.filter(known);

    for (const key of inside.slice(1)) groups.union(inside[0], key);
  }

  return groups.find;
}

function freeName(base, taken) {
  let n = 1;

  while (taken.has(n === 1 ? base : `${base} ${n}`)) n++;

  return n === 1 ? base : `${base} ${n}`;
}

function linkNames(parts, groupOf) {
  const names = new Map();
  const taken = new Set();

  for (const [key, p] of parts) {
    const group = groupOf(key);

    if (names.has(group)) continue;

    const name = freeName(p.name, taken);

    taken.add(name);
    names.set(group, name);
  }

  return names;
}

function linkOf(name, members, look) {
  const world = members[0].world;
  const toLink = world.clone().invert();
  const visuals = members.flatMap((p) => {
    const mesh = look.meshes.get(partKey(p.instance));

    if (!mesh) return [];

    return [
      { mesh: mesh.file, color: mesh.color, origin: toLink.clone().multiply(p.world).multiply(MM_TO_M).toArray() },
    ];
  });
  const weighed = members.flatMap((p) => {
    const m = look.masses.get(partKey(p.instance));

    return m ? [{ kg: m.mass, at: new THREE.Vector3(...m.centroid).applyMatrix4(p.world) }] : [];
  });
  const kg = weighed.reduce((s, w) => s + w.kg, 0);
  const com = weighed.reduce((s, w) => s.addScaledVector(w.at, w.kg / kg), new THREE.Vector3()).applyMatrix4(toLink);

  return {
    name,
    world: world.toArray(),
    mesh: null,
    color: visuals[0]?.color ?? null,
    visuals,
    occurrences: members.map((p) => pathKey(p.path)),
    ...(kg > 0 ? { mass: kg, com: com.toArray() } : {}),
  };
}

function fixedJoint(name, parent, child) {
  return {
    name,
    type: 'fixed',
    parent,
    child,
    world: IDENTITY,
    axis: [0, 0, 1],
    limit: null,
    effort: null,
    velocity: null,
  };
}

function mateJoint(b, mate, parentGroup) {
  const childIsSecond = b.groupOf(mate.ends[0].path) === parentGroup;
  const frames = mate.ends.map((e) => frameOf(b.parts.get(e.path).world, e.cs));
  const limit = b.limits.get(mate.id)?.[mate.type] ?? null;
  const parent = b.names.get(parentGroup);
  const child = b.names.get(b.groupOf(mate.ends[childIsSecond ? 1 : 0].path));

  if (!JOINT_TYPES[mate.type]) {
    b.fixedMates.push({ name: mate.name, link: child });

    return fixedJoint(mate.name, parent, child);
  }

  const frame = jointFrame({ type: mate.type, frames, childIsSecond, limit });

  return {
    name: mate.name,
    type: JOINT_TYPES[mate.type],
    parent,
    child,
    ...frame,
    effort: null,
    velocity: null,
    mate: mate.id,
  };
}

function treeJoints(b, root) {
  const joints = [];
  const seen = new Set([root]);
  const queue = [root];
  const open = b.mates.filter((m) => m.ends.every((e) => b.parts.has(e.path)));
  const used = new Set();

  for (let group = queue.shift(); group !== undefined; group = queue.shift()) {
    for (const mate of open) {
      const groups = mate.ends.map((e) => b.groupOf(e.path));

      if (used.has(mate) || !groups.includes(group)) continue;

      used.add(mate);

      const other = groups[0] === group ? groups[1] : groups[0];

      if (other === group || seen.has(other)) continue;

      seen.add(other);
      queue.push(other);
      joints.push(mateJoint(b, mate, group));
    }
  }

  return { joints, seen };
}

export function assemblyModel({ name, occurrences, limits, masses, meshes }) {
  const { parts, features, fixed } = occurrences;

  if (!parts.size) throw new Error('This assembly has no parts.');

  const mates = matesOf(features);
  const groupOf = rigidGroups(parts, mates, features);
  const names = linkNames(parts, groupOf);
  const b = { parts, mates, groupOf, names, limits, fixedMates: [] };
  const root = groupOf(fixed ?? parts.keys().next().value);
  const { joints, seen } = treeJoints(b, root);
  const members = new Map();

  for (const [key, p] of parts) members.set(groupOf(key), [...(members.get(groupOf(key)) ?? []), p]);

  for (const group of members.keys())
    if (!seen.has(group)) joints.push(fixedJoint(`${names.get(group)} fixed`, names.get(root), names.get(group)));

  return {
    format: 'basecase-onshape',
    version: 1,
    name,
    root: names.get(root),
    links: [...members].map(([group, list]) => linkOf(names.get(group), list, { meshes, masses })),
    joints,
    friction: null,
    notes: [],
    fixedMates: b.fixedMates,
  };
}
