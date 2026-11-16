import type { CustomModelSubNode, ScenePart } from '../types/robotics';

export const KIT_MAX_BYTES = 256 * 1024 * 1024;

type GeometrySource = Pick<ScenePart, 'cad' | 'mesh' | 'sculptMesh' | 'customNodes' | 'boolean'> &
  Pick<CustomModelSubNode, 'contour' | 'lathe'>;

function geometryBytes(source: GeometrySource) {
  const values = [source.cad, source.mesh, source.sculptMesh].reduce(
    (total, mesh) => total + (mesh ? mesh.positions.length + (mesh.indices?.length ?? 0) : 0),
    source.cad?.edges?.length ?? 0,
  );
  const points =
    (source.contour?.outerLoop.length ?? 0) +
    (source.contour?.holes?.reduce((total, hole) => total + hole.length, 0) ?? 0) +
    (source.lathe?.profilePoints.length ?? 0);

  return (values + points * 2) * 8;
}

export function checkKitSource(parts: ScenePart[]) {
  if (parts.length > 10000) throw new Error('Kit export exceeds 10,000 scene parts.');

  const pending: GeometrySource[] = [...parts];
  let size = 0;

  while (pending.length) {
    const source = pending.pop()!;

    size += geometryBytes(source);

    if (size > KIT_MAX_BYTES) throw new Error('Kit export exceeds 256 MB.');

    for (const operand of source.boolean?.operands ?? []) pending.push(operand);

    for (const node of source.customNodes ?? []) {
      pending.push(node);

      if (node.part) pending.push(node.part);
    }
  }
}
