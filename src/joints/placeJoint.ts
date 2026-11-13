import { sharedAxis, slideTravel } from './axisFinder';
import type { Vec3 } from './vec3';

export interface PlacedSoup {
  soup: Float32Array;
  matrix: ArrayLike<number>;
}

export interface JointAxis {
  origin: Vec3;
  axis: Vec3;
}

export interface PlaceJointJob {
  parent: PlacedSoup;
  child: PlacedSoup;
  at?: JointAxis;
  slide: boolean;
}

export interface JointPlacement {
  at: JointAxis;
  travel: [number, number] | null;
}

export function worldSoup({ soup, matrix: m }: PlacedSoup): Float32Array {
  const out = new Float32Array(soup.length);

  for (let i = 0; i < soup.length; i += 3) {
    const [x, y, z] = [soup[i], soup[i + 1], soup[i + 2]];

    out[i] = m[0] * x + m[4] * y + m[8] * z + m[12];
    out[i + 1] = m[1] * x + m[5] * y + m[9] * z + m[13];
    out[i + 2] = m[2] * x + m[6] * y + m[10] * z + m[14];
  }

  return out;
}

export function placeJoint({ parent, child, at, slide }: PlaceJointJob): JointPlacement | null {
  const parentSoup = worldSoup(parent);
  const childSoup = worldSoup(child);
  const face = at ?? sharedAxis(parentSoup, childSoup);

  if (!face) return null;

  const axis = { origin: face.origin, axis: face.axis };

  return { at: axis, travel: slide ? slideTravel(parentSoup, childSoup, axis) : null };
}
