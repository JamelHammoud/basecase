import * as THREE from 'three';
import {
  BEARINGS,
  HEAT_INSERT,
  HEX_BOLT,
  HEX_NUT,
  HOLES,
  HardwareSpec,
  LARGE_WASHER,
  LOCK_NUT,
  SQUARE_NUT,
  STANDOFF,
  THREAD,
  WASHER,
  hardwareDimensions,
  hexCorners,
  isMetric,
  screwHead,
} from '../data/hardware';
import { PartKind, ScenePart } from '../types/robotics';

interface LocalCutout {
  name: string;
  kind: Extract<PartKind, 'hole_cylinder' | 'hole_box' | 'hex_prism' | 'cone'>;
  dims: { width: number; height: number; depth: number };
  /** Center relative to the hardware part's center, before its rotation */
  y: number;
  /** Extra local rotation (degrees) */
  rot?: [number, number, number];
}

/** Printed-part tolerance added on top of nominal clearances */
const FIT = 0.2;

/**
 * Cutouts that make room for a piece of hardware in a printed part:
 * clearance shafts, counterbores, countersinks, nut traps, insert holes, bearing seats.
 */
function localCutouts(spec: HardwareSpec): LocalCutout[] {
  const H = hardwareDimensions(spec).height;
  const bottom = -H / 2;
  const top = H / 2;
  const L = spec.length ?? 0;
  const cyl = (name: string, dia: number, from: number, to: number): LocalCutout => ({
    name,
    kind: 'hole_cylinder',
    dims: { width: dia, height: to - from, depth: dia },
    y: (from + to) / 2,
  });

  if (spec.type === 'bearing') {
    const b = BEARINGS[spec.size];
    return [cyl(`${spec.size} Bearing Seat`, b.D + 0.1, bottom - 0.1, top + 0.1)];
  }
  if (spec.type === 'dowel_pin') {
    return [cyl(`Ø${spec.size} Pin Hole`, Number(spec.size) + 0.1, bottom - 0.2, top + 0.2)];
  }
  if (!isMetric(spec.size)) return [];
  const size = spec.size;
  const clear = HOLES[size].clearance + FIT;

  switch (spec.type) {
    case 'socket_head':
    case 'button_head':
    case 'pan_head': {
      const head = screwHead(spec)!;
      return [
        cyl(`${size} Clearance Hole`, clear, bottom - 0.5, bottom + L),
        cyl(`${size} Counterbore`, head.dk + 0.6, bottom + L - 0.01, top + 0.4),
      ];
    }
    case 'hex_bolt': {
      const head = HEX_BOLT[size]!;
      return [
        cyl(`${size} Clearance Hole`, clear, bottom - 0.5, bottom + L),
        cyl(`${size} Head Recess`, hexCorners(head.s) + 0.6, bottom + L - 0.01, top + 0.4),
      ];
    }
    case 'countersunk': {
      const head = screwHead(spec)!;
      const sinkDia = head.dk + 0.4;
      const sinkH = (sinkDia - THREAD[size].d) / 2; // 90° cone
      return [
        cyl(`${size} Clearance Hole`, clear, bottom - 0.5, top - head.k + 0.01),
        {
          name: `${size} Countersink`,
          kind: 'cone',
          dims: { width: sinkDia, height: sinkH, depth: sinkDia },
          y: top - sinkH / 2 + 0.01,
          rot: [180, 0, 0], // wide end up
        },
      ];
    }
    case 'set_screw':
      return [cyl(`${size} Tapped Hole`, HOLES[size].tap, bottom - 0.5, top + 0.5)];
    case 'hex_nut':
    case 'lock_nut': {
      const s = (spec.type === 'hex_nut' ? HEX_NUT : LOCK_NUT)[size]!.s + 0.3;
      const e = hexCorners(s);
      return [
        {
          name: `${size} Nut Trap`,
          kind: 'hex_prism',
          // hex_prism has corners along Z at width = depth = e; turn 90° to match the nut
          dims: { width: e, height: H + 0.3, depth: e },
          y: 0,
          rot: [0, 90, 0],
        },
        cyl(`${size} Clearance Hole`, clear, bottom - 6, top + 6),
      ];
    }
    case 'square_nut': {
      const n = SQUARE_NUT[size]!;
      return [
        {
          name: `${size} Square Nut Slot`,
          kind: 'hole_box',
          dims: { width: n.s + 0.3, height: n.m + 0.3, depth: n.s + 0.3 },
          y: 0,
        },
        cyl(`${size} Clearance Hole`, clear, bottom - 6, top + 6),
      ];
    }
    case 'washer':
    case 'large_washer': {
      const w = (spec.type === 'washer' ? WASHER : LARGE_WASHER)[size]!;
      return [cyl(`${size} Washer Recess`, w.d2 + 0.6, bottom - 0.01, top + 0.2)];
    }
    case 'heat_insert': {
      const ins = HEAT_INSERT[size]!;
      return [cyl(`${size} Insert Hole`, ins.hole + FIT, top - ins.l - 1, top + 0.01)];
    }
    case 'standoff_mf': {
      const so = STANDOFF[size]!;
      return [cyl(`${size} Clearance Hole`, clear, bottom - 0.5, bottom + so.male + 0.01)];
    }
    case 'standoff_ff':
      return [];
  }
}

/**
 * World-space cutout parts for a hardware part, following its position and rotation.
 */
export function hardwareCutoutParts(part: ScenePart, newId: () => string): ScenePart[] {
  if (!part.hardware) return [];
  const q = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(...(part.rotation.map((d) => THREE.MathUtils.degToRad(d)) as [number, number, number]), 'XYZ')
  );
  const center = new THREE.Vector3(...part.position);
  const r = (v: number) => Math.round(v * 100) / 100;

  return localCutouts(part.hardware).map((c) => {
    const pos = new THREE.Vector3(0, c.y, 0).applyQuaternion(q).add(center);
    const localQ = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(...((c.rot ?? [0, 0, 0]).map((d) => THREE.MathUtils.degToRad(d)) as [number, number, number]), 'XYZ')
    );
    const e = new THREE.Euler().setFromQuaternion(q.clone().multiply(localQ), 'XYZ');
    return {
      id: newId(),
      name: c.name,
      kind: c.kind,
      category: 'ai_markers',
      role: 'cutout',
      position: [r(pos.x), r(pos.y), r(pos.z)],
      rotation: [e.x, e.y, e.z].map((v) => Math.round(THREE.MathUtils.radToDeg(v) * 10) / 10) as [number, number, number],
      dimensions: { width: r(c.dims.width), height: r(c.dims.height), depth: r(c.dims.depth) },
      color: '#ef4444',
      note: `For ${part.name}`,
      mechanicalTag: 'Cutout / Clearance',
      visible: true,
      locked: false,
    } satisfies ScenePart;
  });
}
