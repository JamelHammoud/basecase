import { isStale } from '../booleans/hash';
import { isBooleanPart } from '../booleans/parts';
import { BufferGeometry, Float32BufferAttribute, Matrix4, Vector3, Euler } from 'three';
import { buildPartGroup, releasePartGroup } from '../three/buildPartMesh';
import { worldTriangles } from '../three/meshMeasure';
import type { ScenePart } from '../types/robotics';
import { checkDrawingMesh } from './drawingValidation';
import { DRAWING_LIMITS, type DrawingOptions } from './drawingTypes';

export function validateDrawingPart(part: ScenePart) {
  const values = [
    ...part.position,
    ...part.rotation,
    ...Object.values(part.dimensions),
    ...(part.sheetTransform ?? []),
  ];
  const source = part.mesh ?? part.cad ?? part.sculptMesh;

  if (!values.every(Number.isFinite) || Object.values(part.dimensions).some((n) => n <= 0))
    throw new Error(`${part.name}: use finite, positive dimensions and finite transforms.`);

  if (!source) return;

  if ((source.indices?.length ?? source.positions.length / 3) / 3 > DRAWING_LIMITS.triangles)
    throw new Error(`${part.name}: use a finite mesh with at most 100,000 triangles.`);

  validateSourceMesh(source, part.name);
}

function validateSourceMesh(source: { positions: number[]; indices?: number[] }, name: string) {
  if (
    source.positions.length % 3 ||
    !source.positions.every(Number.isFinite) ||
    source.indices?.some((i) => !Number.isSafeInteger(i) || i < 0 || i >= source.positions.length / 3) ||
    (source.indices?.length ?? source.positions.length / 3) % 3
  )
    throw new Error(`${name}: repair the mesh before exporting drawings.`);
}

function frameMatrix(options: DrawingOptions) {
  if (options.plane === 'xz') return new Matrix4().makeRotationX(Math.PI / 2);

  if (options.plane === 'yz')
    return new Matrix4().makeBasis(new Vector3(0, 1, 0), new Vector3(0, 0, 1), new Vector3(1, 0, 0)).invert();

  return new Matrix4();
}

export function drawingPart(part: ScenePart, options: DrawingOptions) {
  validateDrawingPart(part);

  if (isBooleanPart(part) && isStale(part))
    throw new Error(`${part.name}: update the boolean geometry before exporting drawings.`);

  const source = {
    ...part,
    position: [0, 0, 0] as [number, number, number],
    rotation: [0, 0, 0] as [number, number, number],
  };

  const group = buildPartGroup(source, false);

  try {
    if (group.userData.placeholder)
      throw new Error(`${part.name}: load the source geometry before exporting drawings.`);

    const triangles = worldTriangles(group);

    checkDrawingMesh(triangles, part.name);

    const geometry = new BufferGeometry().setAttribute('position', new Float32BufferAttribute(triangles, 3));
    const matrix = frameMatrix(options);

    if (options.frame === 'scene')
      matrix.multiply(
        new Matrix4().makeRotationFromEuler(
          new Euler(...(part.rotation.map((n) => (n * Math.PI) / 180) as [number, number, number])),
        ),
      );

    geometry.applyMatrix4(matrix);
    geometry.computeBoundingBox();

    const box = geometry.boundingBox!;
    const datum = box.min.toArray();
    const extents = box.getSize(new Vector3()).toArray();

    geometry.translate(-datum[0], -datum[1], -datum[2]);

    const positions = geometry.getAttribute('position').array as Float32Array;

    geometry.dispose();

    return {
      triangles: positions,
      sourceTriangles: triangles,
      datum,
      extents,
      projectionMatrix: new Matrix4().makeTranslation(-datum[0], -datum[1], -datum[2]).multiply(matrix).toArray(),
    };
  } finally {
    releasePartGroup(group);
  }
}
