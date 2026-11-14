import type { WeldedMesh } from '../../booleans/csg';
import { textStrokes, textWidth, type Stroke } from './labelFont';
import type { FlatFace, V3 } from './labelFaces';
import { LABEL_MM, type LabelSpot } from './labelFit';

type P2 = [number, number];

const BOX_TRIANGLES = [
  [4, 5, 6],
  [4, 6, 7],
  [0, 2, 1],
  [0, 3, 2],
  [0, 1, 5],
  [0, 5, 4],
  [1, 2, 6],
  [1, 6, 5],
  [2, 3, 7],
  [2, 7, 6],
  [3, 0, 4],
  [3, 4, 7],
].flat();

export function labelPoint(face: FlatFace, [s, t]: P2, z: number): V3 {
  const h = face.offset + z;

  return [0, 1, 2].map((k) => face.u[k] * s + face.v[k] * t + face.normal[k] * h) as V3;
}

export function textToFace(spot: LabelSpot, width: number): (p: P2) => P2 {
  const { at, height, turned } = spot;

  return ([x, y]) => {
    const [a, b] = [(x - width / 2) * height, (y - 0.5) * height];

    return turned ? [at[0] - b, at[1] + a] : [at[0] + a, at[1] + b];
  };
}

function strokeRing(stroke: Stroke, toFace: (p: P2) => P2, halfWidth: number): P2[] | null {
  const a = toFace([stroke[0], stroke[1]]);
  const b = toFace([stroke[2], stroke[3]]);
  const length = Math.hypot(b[0] - a[0], b[1] - a[1]);

  if (length < 1e-6) return null;

  const d: P2 = [((b[0] - a[0]) / length) * halfWidth, ((b[1] - a[1]) / length) * halfWidth];
  const q: P2 = [-d[1], d[0]];
  const start: P2 = [a[0] - d[0], a[1] - d[1]];
  const end: P2 = [b[0] + d[0], b[1] + d[1]];

  return [
    [start[0] - q[0], start[1] - q[1]],
    [end[0] - q[0], end[1] - q[1]],
    [end[0] + q[0], end[1] + q[1]],
    [start[0] + q[0], start[1] + q[1]],
  ];
}

function prism(face: FlatFace, ring: P2[]): WeldedMesh {
  const corners = [
    ...ring.map((p) => labelPoint(face, p, -LABEL_MM.depth)),
    ...ring.map((p) => labelPoint(face, p, LABEL_MM.lift)),
  ];

  return { positions: Float32Array.from(corners.flat()), indices: Uint32Array.from(BOX_TRIANGLES) };
}

export function labelSolids(face: FlatFace, spot: LabelSpot, text: string): WeldedMesh[] {
  const toFace = textToFace(spot, textWidth(text));

  return textStrokes(text).flatMap((stroke) => {
    const ring = strokeRing(stroke, toFace, spot.stroke / 2);

    return ring ? [prism(face, ring)] : [];
  });
}
