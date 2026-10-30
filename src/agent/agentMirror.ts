import * as THREE from 'three';
import type { Port } from '../types/ports';
import type { ScenePart } from '../types/robotics';
import { mirrorCode } from './cadCode';
import { mirrorByDatum } from './mirrorDatum';
import { eulerToMatrix, groupFor, matrixToEuler, MIRROR_AXIS_INDEX, type V3 } from './agentFrame';

const SIDE_WORDS: Record<'x' | 'y' | 'z', [string, string][]> = {
  x: [['left', 'right']],
  y: [
    ['front', 'rear'],
    ['front', 'back'],
  ],
  z: [['top', 'bottom']],
};

function matchCase(m: string, out: string): string {
  if (m === m.toUpperCase()) return out.toUpperCase();

  return m[0] === m[0].toUpperCase() ? out[0].toUpperCase() + out.slice(1) : out;
}

export function swapWords(s: string, pairs: [string, string][]) {
  return pairs.reduce((acc, [a, b]) => {
    const re = new RegExp(`(?<![A-Za-z])(${a}|${b})(?![a-z])`, 'gi');

    return acc.replace(re, (m) => matchCase(m, m.toLowerCase() === a ? b : a));
  }, s);
}

function flipAxis(v: V3, k: number): V3 {
  const o: V3 = [...v];

  o[k] = -o[k];

  return o;
}

const CODE_AXIS: Record<number, 0 | 1 | 2> = { 0: 0, 1: 2, 2: 1 };

function flipPorts(ports: Port[] | undefined, c: number): Port[] | undefined {
  return ports?.map((p) => ({
    ...p,
    position: flipAxis(p.position, c),
    axis: flipAxis(p.axis, c),
    ...(p.ref ? { ref: flipAxis(p.ref, c) } : {}),
  }));
}

function mirrorCad(cad: NonNullable<ScenePart['cad']>, k: number): NonNullable<ScenePart['cad']> {
  const pos = cad.positions.slice();

  for (let i = k; i < pos.length; i += 3) pos[i] = -pos[i];

  const idx = cad.indices.slice();

  for (let i = 0; i < idx.length; i += 3) [idx[i + 1], idx[i + 2]] = [idx[i + 2], idx[i + 1]];

  const edges = cad.edges?.slice() ?? null;

  if (edges) for (let i = k; i < edges.length; i += 3) edges[i] = -edges[i];

  const c = CODE_AXIS[k];
  const ports = flipPorts(cad.ports, c);

  return {
    ...cad,
    code: mirrorCode(cad.language, cad.code, c),
    positions: pos,
    indices: idx,
    edges,
    originOffset: flipAxis(cad.originOffset, k),
    ...(ports ? { ports } : {}),
  };
}

function twinId(parts: ScenePart[], src: ScenePart, axis: MirrorAxis, rename: Record<string, string>): string {
  if (rename[src.id]) return rename[src.id];

  const twin = parts.find((p) => p.mirrorOf?.id === src.id && p.mirrorOf.axis === axis);

  if (twin) return twin.id;

  const swapped = swapWords(src.id, SIDE_WORDS[axis]);

  return swapped === src.id ? `${src.id}-mirror` : swapped;
}

function placement(src: ScenePart, k: 0 | 1 | 2): Pick<ScenePart, 'position' | 'rotation'> {
  if (src.kind === 'component' || src.kind === 'hardware') return mirrorByDatum(src, k);

  const S = new THREE.Matrix4().makeScale(k === 0 ? -1 : 1, k === 1 ? -1 : 1, k === 2 ? -1 : 1);

  return {
    position: flipAxis(src.position, k),
    rotation: matrixToEuler(S.clone().multiply(eulerToMatrix(src.rotation)).multiply(S)),
  };
}

type MirrorAxis = 'x' | 'y' | 'z';

function unlinked(src: ScenePart): ScenePart {
  const copy = { ...src };

  delete copy.jointId;
  delete copy.mates;

  return copy;
}

export function mirrorParts(
  parts: ScenePart[],
  ids: string[],
  axis: MirrorAxis,
  rename: Record<string, string>,
): ScenePart[] {
  const k = MIRROR_AXIS_INDEX[axis];
  const words = SIDE_WORDS[axis];
  const used = new Set<string>(ids);

  return ids.flatMap((id) => {
    const src = parts.find((p) => p.id === id);

    if (!src) return [];

    let newId = twinId(parts, src, axis, rename);

    while (used.has(newId)) newId = `${newId}-mirror`;

    used.add(newId);

    const swappedName = swapWords(src.name, words);
    const copy: ScenePart = {
      ...unlinked(src),
      id: newId,
      name: swappedName === src.name ? `${src.name} (Mirror)` : swappedName,
      ...placement(src, k),
      group: src.group ? groupFor(swapWords(src.group.name, words)) : undefined,
      mirrorOf: { id: src.id, axis },
    };

    if (src.kind === 'cad_part' && src.cad) copy.cad = mirrorCad(src.cad, k);

    return [copy];
  });
}
