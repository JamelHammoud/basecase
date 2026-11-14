import type { WorldItem } from '../sim/mjcfTypes';
import { worldItem, type Case } from './schema';
import { CaseFileError } from './validate';
import { getWorldAsset } from './worldAssets';
import type { ImportedWorldRef } from './worldReference';

function hullDimensions(vertices: Float32Array) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];

  for (let i = 0; i < vertices.length; i++) {
    const axis = i % 3;

    min[axis] = Math.min(min[axis], vertices[i]);
    max[axis] = Math.max(max[axis], vertices[i]);
  }

  return { width: max[0] - min[0], height: max[1] - min[1], depth: max[2] - min[2] };
}

export function importedWorldItems(ref: ImportedWorldRef | undefined): WorldItem[] {
  if (!ref) return [];

  const asset = getWorldAsset(ref.hash);

  if (!asset) throw new CaseFileError('The imported world asset is missing.');

  return asset.pieces.map((piece, index) => ({
    id: `imported-${index}-${ref.hash.slice(0, 16)}`,
    name: asset.world.name,
    kind: 'box',
    category: 'structure',
    role: 'solid',
    position: ref.position,
    rotation: [0, 0, 0],
    dimensions: hullDimensions(piece.positions),
    color: '#aaaaaa',
    note: '',
    visible: false,
    locked: true,
    behavior: 'static',
    convexVertices: piece.positions,
  }));
}

export function caseWorldItems(kase: Pick<Case, 'world'>, worldColliders?: WorldItem[]): WorldItem[] {
  return [...kase.world.objects.map(worldItem), ...(worldColliders ?? importedWorldItems(kase.world.imported))];
}
