import type { BufferGeometry } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export function mergeGeometryParts(parts: BufferGeometry[]): BufferGeometry | null {
  if (parts.length === 0) return null;

  return parts.length === 1 ? parts[0] : mergeGeometries(parts, false);
}
