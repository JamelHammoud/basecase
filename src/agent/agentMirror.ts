import * as THREE from 'three';
import type { ScenePart } from '../types/robotics';
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

function swapWords(s: string, pairs: [string, string][]) {
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

function mirrorCad(cad: NonNullable<ScenePart['cad']>, k: number): NonNullable<ScenePart['cad']> {
  const pos = cad.positions.slice();

  for (let i = k; i < pos.length; i += 3) pos[i] = -pos[i];

  const idx = cad.indices.slice();

  for (let i = 0; i < idx.length; i += 3) [idx[i + 1], idx[i + 2]] = [idx[i + 2], idx[i + 1]];

  const edges = cad.edges?.slice() ?? null;

  if (edges) for (let i = k; i < edges.length; i += 3) edges[i] = -edges[i];

  return { ...cad, positions: pos, indices: idx, edges, originOffset: flipAxis(cad.originOffset, k) };
}

export function mirrorParts(
  parts: ScenePart[],
  ids: string[],
  axis: 'x' | 'y' | 'z',
  rename: Record<string, string>,
): ScenePart[] {
  const k = MIRROR_AXIS_INDEX[axis];
  const words = SIDE_WORDS[axis];
  const S = new THREE.Matrix4().makeScale(k === 0 ? -1 : 1, k === 1 ? -1 : 1, k === 2 ? -1 : 1);
  const taken = new Set(parts.map((p) => p.id));

  return ids.flatMap((id) => {
    const src = parts.find((p) => p.id === id);

    if (!src) return [];

    let newId = rename[id] ?? swapWords(id, words);

    if (newId === id || taken.has(newId)) newId = `${newId}-mirror`;

    taken.add(newId);

    const swappedName = swapWords(src.name, words);
    const rotation = matrixToEuler(S.clone().multiply(eulerToMatrix(src.rotation)).multiply(S));
    const copy: ScenePart = {
      ...src,
      id: newId,
      name: swappedName === src.name ? `${src.name} (Mirror)` : swappedName,
      position: flipAxis(src.position, k),
      rotation,
      group: src.group ? groupFor(swapWords(src.group.name, words)) : undefined,
    };

    if (src.kind === 'cad_part' && src.cad) copy.cad = mirrorCad(src.cad, k);

    return [copy];
  });
}
