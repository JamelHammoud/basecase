import { obsSize, type PolicyLayer, type PolicySpec } from '../sim/policy';

export interface PolicyTarget {
  joints: string[];
  defaultPose: number[];
}

const BASE = 12;

function columnOf(map: number[], sourceJoints: number) {
  const m = map.length;

  return (c: number) => {
    if (c < BASE) return c;

    const block = Math.floor((c - BASE) / m);

    return BASE + block * sourceJoints + map[(c - BASE) % m];
  };
}

function remapColumns(layer: PolicyLayer, columns: number[]): PolicyLayer {
  const width = columns.length;
  const copies = new Map<number, number>();

  for (const c of columns) copies.set(c, (copies.get(c) ?? 0) + 1);

  const w = new Array<number>(layer.out * width);

  for (let o = 0; o < layer.out; o++)
    for (let c = 0; c < width; c++) w[o * width + c] = layer.w[o * layer.in + columns[c]] / copies.get(columns[c])!;

  return { in: width, out: layer.out, w, b: layer.b };
}

function remapRows(layer: PolicyLayer, map: number[]): PolicyLayer {
  return {
    in: layer.in,
    out: map.length,
    w: map.flatMap((s) => layer.w.slice(s * layer.in, (s + 1) * layer.in)),
    b: map.map((s) => layer.b[s]),
  };
}

function remapLayers(layers: PolicyLayer[], options: { map: number[]; columns: number[] }) {
  return layers.map((layer, i) => {
    const first = i === 0 ? remapColumns(layer, options.columns) : layer;

    return i === layers.length - 1 ? remapRows(first, options.map) : first;
  });
}

export function mappedPolicy(policy: PolicySpec, map: number[], target: PolicyTarget): PolicySpec {
  const n = policy.joints.length;

  if (policy.eyes?.length || policy.clock) throw new Error('This policy reads a camera or a clock, so it can’t move.');

  if (policy.obsMean.length !== obsSize(n) || policy.layers.at(-1)?.out !== n)
    throw new Error('This policy’s network doesn’t match its joints.');

  if (map.length !== target.joints.length || map.some((s) => !Number.isInteger(s) || s < 0 || s >= n))
    throw new Error('The joint map doesn’t fit this policy.');

  const column = columnOf(map, n);
  const columns = Array.from({ length: obsSize(map.length) }, (_, c) => column(c));

  return {
    ...policy,
    joints: target.joints,
    defaultPose: target.defaultPose,
    obsMean: columns.map((c) => policy.obsMean[c]),
    obsStd: columns.map((c) => policy.obsStd[c]),
    layers: remapLayers(policy.layers, { map, columns }),
  };
}
