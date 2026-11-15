import { failureIndex, type LayeredMaterial, type V3 } from './material';
import { unit } from './loads';

export function stressIndices(
  nodal: Float64Array,
  read: Uint8Array,
  options: { normal: V3; material: LayeredMaterial; indices: Float32Array },
) {
  const normal = unit(options.normal);
  const { indices } = options;
  let worst = 0;
  let worstNode = 0;

  for (let k = 0; k < indices.length; k++) {
    indices[k] = read[k] ? failureIndex(nodal.subarray(k * 6, k * 6 + 6), normal, options.material) : 0;

    if (!read[k] || indices[k] <= worst) continue;

    worst = indices[k];
    worstNode = k;
  }

  return { worst, worstNode };
}

export function stressRatios(nodes: Int32Array, indices: Float32Array): Float32Array {
  const ratios = new Float32Array(nodes.length / 8);

  for (let e = 0; e < ratios.length; e++) {
    let peak = -Infinity;

    for (let a = 0; a < 8; a++) peak = Math.max(peak, indices[nodes[e * 8 + a]]);

    ratios[e] = Math.sqrt(peak);
  }

  return ratios;
}
