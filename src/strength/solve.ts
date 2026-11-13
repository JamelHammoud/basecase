import { conjugateGradient, type ElasticSystem } from './cg';
import { tangentialForces, unit } from './loads';
import { hexElement, type HexElement } from './hexElement';
import {
  failureIndex,
  solidShare,
  stiffnessFor,
  stressShare,
  type LayeredMaterial,
  type PrintFill,
  type V3,
} from './material';
import { components, hexMesh, nodesNear, type HexMesh, type ScrewLine } from './mesh';
import { surfaceDepth, voxelize, type VoxelGrid } from './voxels';

export interface TorqueLoad {
  origin: V3;
  axis: V3;
  torqueNmm: number;
  screws: ScrewLine[];
}

export interface StrengthModel {
  tris: ArrayLike<number>;
  material: LayeredMaterial;
  fill: PrintFill;
  normal: V3;
  load: TorqueLoad;
  holds: ScrewLine[];
  normals?: V3[];
  cellMm?: number;
}

export interface StressField {
  origin: V3;
  h: V3;
  n: V3;
  cells: Int32Array;
  ratio: Float32Array;
}

export interface StrengthResult {
  factor: number;
  factors: number[];
  worst: V3;
  field: StressField;
  cells: number;
  iterations: number;
}

const TOLERANCE = 1e-4;
const MAX_ITERATIONS = 6000;

function connectedCells(grid: VoxelGrid, touches: (cell: number) => { load: boolean; hold: boolean }) {
  const label = components(grid);
  const loaded = new Set<number>();
  const held = new Set<number>();

  for (let c = 0; c < label.length; c++) {
    if (label[c] < 0) continue;

    const t = touches(c);

    if (t.load) loaded.add(label[c]);

    if (t.hold) held.add(label[c]);
  }

  return (c: number) => loaded.has(label[c]) && held.has(label[c]);
}

interface Solved {
  mesh: HexMesh;
  element: HexElement;
  u: Float64Array;
  pinned: Uint8Array;
  share: Float64Array;
  iterations: number;
}

function cellNear(grid: VoxelGrid, lines: ScrewLine[], slack: number) {
  const probe = hexMesh(grid);
  const near = nodesNear(probe, lines, slack);
  const byCell = new Uint8Array(grid.solid.length);

  probe.cells.forEach((c, e) => {
    for (let a = 0; a < 8; a++) if (near[probe.nodes[e * 8 + a]]) byCell[c] = 1;
  });

  return byCell;
}

export function solveDisplacement(model: StrengthModel, grid: VoxelGrid): Solved | null {
  const slack = Math.max(...grid.h);
  const loadCells = cellNear(grid, model.load.screws, slack);
  const holdCells = cellNear(grid, model.holds, slack);
  const keep = connectedCells(grid, (c) => ({ load: !!loadCells[c], hold: !!holdCells[c] }));
  const mesh = hexMesh(grid, keep);

  if (!mesh.cells.length) return null;

  const loaded = nodesNear(mesh, model.load.screws, slack);
  const held = nodesNear(mesh, model.holds, slack);
  const depth = surfaceDepth(grid);
  const meanH = (grid.h[0] + grid.h[1] + grid.h[2]) / 3;
  const element = hexElement(grid.h, stiffnessFor(model.material, model.normal));
  const scale = Float64Array.from(mesh.cells, (c) => solidShare(depth[c], meanH, model.fill));
  const system: ElasticSystem = {
    nodes: mesh.nodes,
    scale,
    stiffness: element.stiffness,
    fixed: new Uint8Array(loaded.length * 3).map((_, i) => loaded[(i / 3) | 0]),
  };
  const forces = tangentialForces(mesh, held, { ...model.load, torqueNmm: -model.load.torqueNmm });
  const { u, iterations } = conjugateGradient(system, forces, { tolerance: TOLERANCE, maxIterations: MAX_ITERATIONS });
  const share = Float64Array.from(mesh.cells, (c, e) => scale[e] / stressShare(depth[c], meanH, model.fill));

  return { mesh, element, u, pinned: loaded.map((v, n) => v | held[n]), share, iterations };
}

function averageAtNodes(mesh: HexMesh, corners: Float64Array): Float64Array {
  const count = mesh.positions.length / 3;
  const sum = new Float64Array(count * 6);
  const seen = new Float64Array(count);

  mesh.nodes.forEach((n, slot) => {
    seen[n]++;

    for (let r = 0; r < 6; r++) sum[n * 6 + r] += corners[slot * 6 + r];
  });

  return sum.map((v, i) => v / seen[(i / 6) | 0]);
}

export function sampleStresses(solved: Solved, stiffness: Float64Array): Float64Array {
  const { mesh, element, u } = solved;
  const out = new Float64Array(mesh.cells.length * 8 * 6);
  const ue = new Float64Array(24);
  const eps = new Float64Array(6);

  for (let e = 0; e < mesh.cells.length; e++) {
    for (let a = 0; a < 8; a++) for (let d = 0; d < 3; d++) ue[a * 3 + d] = u[mesh.nodes[e * 8 + a] * 3 + d];

    element.strains.forEach((b, g) => {
      for (let r = 0; r < 6; r++) {
        let s = 0;

        for (let j = 0; j < 24; j++) s += b[r * 24 + j] * ue[j];

        eps[r] = s;
      }

      const at = (e * 8 + g) * 6;

      for (let r = 0; r < 6; r++) {
        let s = 0;

        for (let k = 0; k < 6; k++) s += stiffness[r * 6 + k] * eps[k];

        out[at + r] = s * solved.share[e];
      }
    });
  }

  return averageAtNodes(mesh, out);
}

const PIN_RINGS = 2;

function widen(mesh: HexMesh, marked: Uint8Array): Uint8Array {
  const out = Uint8Array.from(marked);

  for (let e = 0; e < mesh.cells.length; e++) {
    const own = mesh.nodes.subarray(e * 8, e * 8 + 8);

    if (own.some((n) => marked[n])) own.forEach((n) => (out[n] = 1));
  }

  return out;
}

function readableNodes(solved: Solved): Uint8Array {
  const { mesh, pinned } = solved;
  const incident = new Uint8Array(mesh.positions.length / 3);

  mesh.nodes.forEach((n) => incident[n]++);

  const counted = incident.map((c) => (c >= 5 && c <= 7 ? 0 : 1));

  let near = pinned;

  for (let ring = 0; ring < PIN_RINGS; ring++) near = widen(mesh, near);

  near.forEach((v, n) => v && (counted[n] = 0));

  return counted;
}

function worstIndex(solved: Solved, nodal: Float64Array, read: Uint8Array, opts: { model: StrengthModel; normal: V3 }) {
  const n = unit(opts.normal);
  const { mesh } = solved;
  const atNode = new Float32Array(mesh.positions.length / 3);
  let worst = 0;
  let worstNode = 0;

  for (let k = 0; k < atNode.length; k++) {
    if (!read[k]) continue;

    atNode[k] = failureIndex(nodal.subarray(k * 6, k * 6 + 6), n, opts.model.material);

    if (atNode[k] <= worst) continue;

    worst = atNode[k];
    worstNode = k;
  }

  const perCell = Float32Array.from(mesh.cells, (_, e) =>
    Math.max(...Array.from(mesh.nodes.subarray(e * 8, e * 8 + 8), (k) => atNode[k])),
  );

  return { worst, worstNode, perCell };
}

const factorOf = (index: number) => (index > 0 ? 1 / Math.sqrt(index) : Infinity);

export function solveStrength(model: StrengthModel): StrengthResult | null {
  const grid = voxelize(model.tris, model.cellMm);
  const solved = solveDisplacement(model, grid);

  if (!solved) return null;

  const stresses = sampleStresses(solved, stiffnessFor(model.material, model.normal));
  const read = readableNodes(solved);
  const chosen = worstIndex(solved, stresses, read, { model, normal: model.normal });
  const factors = (model.normals ?? []).map((normal) =>
    factorOf(worstIndex(solved, stresses, read, { model, normal }).worst),
  );
  const w = chosen.worstNode * 3;

  return {
    factor: factorOf(chosen.worst),
    factors,
    worst: [solved.mesh.positions[w], solved.mesh.positions[w + 1], solved.mesh.positions[w + 2]],
    field: {
      origin: grid.origin,
      h: grid.h,
      n: grid.n,
      cells: solved.mesh.cells,
      ratio: chosen.perCell.map(Math.sqrt),
    },
    cells: solved.mesh.cells.length,
    iterations: solved.iterations,
  };
}
