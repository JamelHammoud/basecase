import * as THREE from 'three';
import { isId } from './link.mjs';

export const MAX_PARTS = 300;

const MAX_OCCURRENCES = 3000;
const MAX_DEPTH = 8;
const PART_ID = /^[A-Za-z0-9_-]{1,64}$/;
const MAX_CONFIGURATION = 2000;
const MAX_NAME = 120;

export const TOO_MANY_PARTS = `This assembly has more than ${MAX_PARTS} different parts.`;

export const pathKey = (path) => path.join('/');

export const partKey = (i) =>
  [i.documentId, i.documentMicroversion, i.elementId, i.partId, i.configuration ?? ''].join('|');

const sameElement = (a, b) =>
  a.documentId === b.documentId &&
  a.elementId === b.elementId &&
  a.documentMicroversion === b.documentMicroversion &&
  (a.configuration ?? '') === (b.configuration ?? '');

const isPart = (i) =>
  i.type === 'Part' &&
  isId(i.documentId) &&
  isId(i.documentMicroversion) &&
  isId(i.elementId) &&
  PART_ID.test(String(i.partId)) &&
  String(i.configuration ?? '').length <= MAX_CONFIGURATION &&
  (i.documentVersion === undefined || isId(i.documentVersion));

const cleanName = (name, fallback) => String(name ?? '').slice(0, MAX_NAME) || fallback;

function walk(def, assembly, at) {
  if (at.prefix.length > MAX_DEPTH) return;

  for (const inst of assembly.instances ?? []) {
    if (inst?.suppressed) continue;

    const path = [...at.prefix, String(inst.id)];

    if (isPart(inst)) at.parts.set(pathKey(path), { path, name: cleanName(inst.name, 'Part'), instance: inst });

    const sub = inst.type === 'Assembly' ? def.subAssemblies?.find((s) => sameElement(s, inst)) : undefined;

    if (!sub) continue;

    for (const feature of sub.features ?? []) at.features.push({ feature, prefix: path });

    walk(def, sub, { ...at, prefix: path });
  }
}

const isTransform = (t) => Array.isArray(t) && t.length === 16 && t.every(Number.isFinite);

export function occurrencesOf(def) {
  const root = def?.rootAssembly ?? {};
  const at = {
    prefix: [],
    parts: new Map(),
    features: (root.features ?? []).map((feature) => ({ feature, prefix: [] })),
  };

  walk(def, root, at);

  const occurrences = (root.occurrences ?? []).slice(0, MAX_OCCURRENCES);
  const placed = new Map();
  let fixed = null;

  for (const o of occurrences) {
    const key = pathKey((o?.path ?? []).map(String));
    const part = at.parts.get(key);

    if (!part || !isTransform(o.transform)) continue;

    placed.set(key, { ...part, world: new THREE.Matrix4().set(...o.transform) });

    if (o.fixed && !fixed) fixed = key;
  }

  if (new Set([...placed.values()].map((p) => partKey(p.instance))).size > MAX_PARTS) throw new Error(TOO_MANY_PARTS);

  return { parts: placed, features: at.features, fixed };
}

export function uniqueParts(parts) {
  const unique = new Map();

  for (const p of parts.values()) if (!unique.has(partKey(p.instance))) unique.set(partKey(p.instance), p);

  return unique;
}
