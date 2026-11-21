import { buildPartGroup, releasePartGroup } from '../three/buildPartMesh';
import { localTriangles, rigidFrame } from '../three/meshMeasure';
import { place } from '../three/analysis/collide';
import { ShapeSolid } from '../three/analysis/shapeSolid';
import { fitCoupons } from '../three/analysis/fitCoupons';
import type { ScenePart } from '../types/robotics';
import { provideMeshFiles, loadComponentMesh, type MeshFiles } from '../three/componentMeshes';
import type { FitVariantRequest } from './fitVariants';
import { fitKey } from './fitTest';

export interface FitVariantCut {
  parts: ScenePart[];
  request: FitVariantRequest;
  meshFiles?: MeshFiles;
}

export async function fitVariantCoupons({ parts, request, meshFiles }: FitVariantCut) {
  provideMeshFiles(meshFiles);

  const ids = [request.binding.host, request.fit];
  const selected = ids.map((id) => parts.find((p) => p.id === id));

  if (selected.some((p) => !p)) throw new Error('The interface source is missing.');

  await Promise.all(selected.flatMap((part) => (part?.componentId ? [loadComponentMesh(part.componentId)] : [])));

  const groups = selected.map((p) => buildPartGroup(p!, false, { lateEdges: true }));
  const solids: ShapeSolid[] = [];

  try {
    const placed = groups.map((group, i) => {
      const positions = localTriangles(group);

      if (positions.length / 9 > 100_000) throw new Error('Fit variants exceed the geometry limit.');

      const solid = new ShapeSolid(positions);

      solids.push(solid);

      return place(ids[i], solid, rigidFrame(group).matrix);
    });

    const coupons = fitCoupons(placed, {
      fits: [{ id: request.fit, key: fitKey(selected[1]!) ?? `part:${request.fit}` }],
      hosts: [request.binding.host],
      downs: { [request.binding.host]: request.down },
    });

    if (coupons.some((coupon) => coupon.positions.length / 9 > 100_000))
      throw new Error('Fit variants exceed the geometry limit.');

    return coupons;
  } finally {
    groups.forEach(releasePartGroup);
    solids.forEach((solid) => solid.dispose());
  }
}
