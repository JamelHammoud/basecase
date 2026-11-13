import * as THREE from 'three';
import { findJointAxis, type FoundAxis } from '../../joints/axisFinder';
import { jointCandidates, type JointAxes } from '../../joints/jointCandidates';
import { MeshIndex, type V3 } from '../../joints/meshIndex';

export interface JointAxisQuery {
  parent: string;
  child: string;
  pick?: { part: string; point: V3 };
}

interface Placed {
  id: string;
  key: string;
  matrix: number[];
}

const KEEP = 8;
const indexes = new Map<string, MeshIndex>();

function worldPositions(local: Float32Array, matrix: number[]) {
  const m = new THREE.Matrix4().fromArray(matrix);
  const out = new Float32Array(local.length);
  const v = new THREE.Vector3();

  for (let i = 0; i < local.length; i += 3) v.fromArray(local, i).applyMatrix4(m).toArray(out, i);

  return out;
}

function indexOf(placed: Placed | undefined, positionsOf: (key: string) => Float32Array) {
  if (!placed) return null;

  const id = `${placed.key}|${placed.matrix.join(',')}`;
  const known = indexes.get(id);

  if (known) {
    indexes.delete(id);
    indexes.set(id, known);

    return known;
  }

  const made = new MeshIndex(worldPositions(positionsOf(placed.key), placed.matrix));

  indexes.set(id, made);

  if (indexes.size > KEEP) indexes.delete(indexes.keys().next().value!);

  return made;
}

export function jointAxisOf(
  query: JointAxisQuery & { instances: Placed[] },
  positionsOf: (key: string) => Float32Array,
): FoundAxis | null {
  const find = (id: string) =>
    indexOf(
      query.instances.find((i) => i.id === id),
      positionsOf,
    );
  const parent = find(query.parent);
  const child = find(query.child);

  if (!parent || !child) return null;

  const pick = query.pick && {
    part: query.pick.part === query.parent ? ('parent' as const) : ('child' as const),
    point: query.pick.point,
  };

  return findJointAxis(parent, child, pick);
}

export function jointAxesOf(
  query: { ids: string[]; instances: Placed[] },
  positionsOf: (key: string) => Float32Array,
): JointAxes {
  const bodies = query.ids.flatMap((id) => {
    const index = indexOf(
      query.instances.find((i) => i.id === id),
      positionsOf,
    );

    return index ? [{ id, index }] : [];
  });

  return jointCandidates(bodies);
}
