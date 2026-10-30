import * as THREE from 'three';
import { hardwareDimensions, type HardwareSpec } from '../data/hardware';
import { buildPartGroup } from '../three/buildPartMesh';
import type { ScenePart } from '../types/robotics';
import { fastenerSpec, type ScrewSpec } from './fastenerSpec';

export type V3 = [number, number, number];

export const LIFT = 30;
export const HOLE_X = 12;

const base = (id: string, o: Partial<ScenePart>): ScenePart => ({
  id,
  name: id,
  kind: 'cad_part',
  category: 'structure',
  role: 'solid',
  position: [0, 0, 0],
  rotation: [0, 0, 0],
  dimensions: { width: 10, height: 10, depth: 10 },
  color: '#eeeeee',
  note: '',
  visible: true,
  locked: false,
  ...o,
});

interface Slab {
  size: V3;
  holes?: Array<{ x: number; z: number; r: number }>;
  mirror?: boolean;
}

function slabGeometry({ size: [w, t, d], holes = [], mirror }: Slab): THREE.BufferGeometry {
  const shape = new THREE.Shape()
    .moveTo(-w / 2, -d / 2)
    .lineTo(w / 2, -d / 2)
    .lineTo(w / 2, d / 2)
    .lineTo(-w / 2, d / 2)
    .closePath();

  for (const h of holes) shape.holes.push(new THREE.Path().absarc(h.x, -h.z, h.r, 0, Math.PI * 2, true));

  const g = new THREE.ExtrudeGeometry(shape, { depth: t, bevelEnabled: false, curveSegments: 24 }).rotateX(
    -Math.PI / 2,
  );

  return mirror ? mirrored(g) : g;
}

function mirrored(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const flat = (g.index ? g.toNonIndexed() : g).scale(-1, 1, 1);
  const pos = flat.attributes.position;

  for (let i = 0; i < pos.count; i += 3) {
    const [x, y, z] = [pos.getX(i + 1), pos.getY(i + 1), pos.getZ(i + 1)];

    pos.setXYZ(i + 1, pos.getX(i + 2), pos.getY(i + 2), pos.getZ(i + 2));
    pos.setXYZ(i + 2, x, y, z);
  }

  return flat;
}

export function printed(id: string, slab: Slab, at: V3, o: Partial<ScenePart> = {}): ScenePart {
  const g = slabGeometry(slab);
  const flat = g.index ? g.toNonIndexed() : g;
  const positions = Array.from(flat.attributes.position.array as Float32Array);
  const [w, t, d] = slab.size;

  return base(id, {
    position: at,
    dimensions: { width: w, height: t, depth: d },
    cad: {
      language: 'openscad',
      code: '',
      positions,
      indices: Array.from({ length: positions.length / 3 }, (_, i) => i),
      originOffset: [0, 0, 0],
      baseSize: [w, t, d],
    },
    ...o,
  });
}

export function hardware(id: string, spec: HardwareSpec, at: V3): ScenePart {
  const dims = hardwareDimensions(spec);

  return base(id, {
    kind: 'hardware',
    category: 'hardware',
    hardware: spec,
    position: at,
    dimensions: { width: dims.width, height: dims.height, depth: dims.depth },
  });
}

export function screwSeatedAt(
  id: string,
  spec: HardwareSpec,
  { x, z, seatY }: { x: number; z: number; seatY: number },
): ScenePart {
  const s = fastenerSpec(hardware(id, spec, [0, 0, 0])) as ScrewSpec;

  return hardware(id, spec, [x, seatY - s.underY, z]);
}

const M3x10: HardwareSpec = { type: 'socket_head', size: 'M3', length: 10 };
const INSERT: HardwareSpec = { type: 'heat_insert', size: 'M3', length: 5.7 };

export interface BracketOptions {
  prefix?: string;
  x?: number;
  mirror?: boolean;
  cover?: boolean;
}

export function bracket({ prefix = '', x = 0, mirror = false, cover = false }: BracketOptions = {}): ScenePart[] {
  const sign = mirror ? -1 : 1;
  const holeXs = [-HOLE_X, HOLE_X];
  const plateY = LIFT;
  const parts = [
    printed(`${prefix}plate`, { size: [40, 4, 30], holes: holeXs.map((hx) => ({ x: hx, z: 0, r: 1.7 })), mirror }, [
      x,
      plateY,
      0,
    ]),
    printed(`${prefix}boss`, { size: [40, 10, 30], holes: holeXs.map((hx) => ({ x: hx, z: 0, r: 2 })), mirror }, [
      x,
      plateY - 10,
      0,
    ]),
    ...holeXs.map((hx, i) => hardware(`${prefix}insert-${i + 1}`, INSERT, [x + hx, plateY - 2.85, 0])),
    ...holeXs.map((hx, i) => screwSeatedAt(`${prefix}screw-${i + 1}`, M3x10, { x: x + hx, z: 0, seatY: plateY + 4 })),
  ];

  if (!cover) return parts;

  return [
    ...parts,
    printed(`${prefix}cover`, { size: [14, 3, 30], mirror }, [x + sign * (-HOLE_X + 5), plateY + 14, 0]),
  ];
}

export function objectsOf(parts: ScenePart[]) {
  return parts.map((p) => ({ id: p.id, object: buildPartGroup(p, false) }));
}
