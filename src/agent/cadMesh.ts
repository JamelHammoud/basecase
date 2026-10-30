import type { CadAudit, CadExpect, CadPort } from '../types/cadAudit';
import type { Port } from '../types/ports';
import { r2, r3, toScene, type V3 } from './agentFrame';
import { mirroredAxis } from './cadCode';

export interface AgentCadPayload {
  language: 'openscad' | 'replicad';
  code: string;
  positions: number[];
  indices: number[];
  edges?: number[] | null;
  stats?: { volume?: number; triangles?: number };
  ports?: CadPort[];
  audit?: CadAudit;
  expect?: CadExpect;
}

export function cadMeshToScene(cad: AgentCadPayload) {
  const pos = new Array<number>(cad.positions.length);
  const min: V3 = [Infinity, Infinity, Infinity];
  const max: V3 = [-Infinity, -Infinity, -Infinity];

  for (let i = 0; i < cad.positions.length; i += 3) {
    const s = toScene([cad.positions[i], cad.positions[i + 1], cad.positions[i + 2]]);

    for (let k = 0; k < 3; k++) {
      pos[i + k] = s[k];
      min[k] = Math.min(min[k], s[k]);
      max[k] = Math.max(max[k], s[k]);
    }
  }

  const center: V3 = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2];

  for (let i = 0; i < pos.length; i += 3) for (let k = 0; k < 3; k++) pos[i + k] = r3(pos[i + k] - center[k]);

  let edges: number[] | null = null;

  if (cad.edges?.length) {
    edges = new Array<number>(cad.edges.length);

    for (let i = 0; i < cad.edges.length; i += 3) {
      const s = toScene([cad.edges[i], cad.edges[i + 1], cad.edges[i + 2]]);

      for (let k = 0; k < 3; k++) edges[i + k] = r3(s[k] - center[k]);
    }
  }

  const size: V3 = [r2(max[0] - min[0]), r2(max[1] - min[1]), r2(max[2] - min[2])];

  return { positions: pos, indices: cad.indices, edges, center, size };
}

const flip = (v: V3, k: number): V3 => v.map((x, i) => (i === k ? -x : x)) as V3;

export function mirroredPorts(code: string, ports: Port[]): Port[] {
  const k = mirroredAxis(code);

  if (k === null) return ports;

  return ports.map((p) => ({ ...p, position: flip(p.position, k), axis: flip(p.axis, k) }));
}
