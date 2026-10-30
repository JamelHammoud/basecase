import * as THREE from 'three';
import { componentPorts } from '../data/componentPorts';
import { hardwareDimensions, heatInsert, isMetric, THREAD, type HardwareSpec } from '../data/hardware';
import type { Port, PortVec } from '../types/ports';
import type { ScenePart } from '../types/robotics';
import { eulerToMatrix, r2, toCad, toScene, type V3 } from './agentFrame';

const UP: PortVec = [0, 1, 0];
const DOWN: PortVec = [0, -1, 0];

const HEADED = new Set(['socket_head', 'button_head', 'pan_head', 'hex_bolt']);
const NUTS = new Set(['hex_nut', 'lock_nut', 'square_nut', 'washer', 'large_washer', 'standoff_ff']);

function screwPorts(spec: HardwareSpec, H: number): Port[] {
  const d = THREAD[spec.size as keyof typeof THREAD]?.d;
  const L = spec.length ?? 0;
  const seatY = spec.type === 'countersunk' ? H / 2 : -H / 2 + L;

  return [
    { name: 'seat', position: [0, seatY, 0], axis: DOWN, kind: 'face', thread: spec.size, diameterMm: d },
    { name: 'tip', position: [0, -H / 2, 0], axis: DOWN, kind: 'screw', thread: spec.size, diameterMm: d },
  ];
}

export function hardwarePorts(spec: HardwareSpec): Port[] {
  if (!isMetric(spec.size)) return [];

  const H = hardwareDimensions(spec).height;

  if (HEADED.has(spec.type) || spec.type === 'countersunk') return screwPorts(spec, H);

  if (spec.type === 'set_screw') return [{ name: 'tip', position: [0, -H / 2, 0], axis: DOWN, kind: 'screw' }];

  if (spec.type === 'heat_insert')
    return [
      { name: 'top', position: [0, H / 2, 0], axis: UP, kind: 'screw', thread: spec.size, depthMm: heatInsert(spec).l },
      { name: 'bottom', position: [0, -H / 2, 0], axis: DOWN, kind: 'face' },
    ];

  if (NUTS.has(spec.type) || spec.type === 'standoff_mf')
    return [
      { name: 'top', position: [0, H / 2, 0], axis: UP, kind: 'screw', thread: spec.size },
      { name: 'bottom', position: [0, -H / 2, 0], axis: DOWN, kind: 'screw', thread: spec.size },
    ];

  return [];
}

function cadPorts(cad: NonNullable<ScenePart['cad']>): Port[] {
  return (cad.ports ?? []).map((p) => ({
    ...p,
    position: toScene(p.position).map((v, k) => v - cad.originOffset[k]) as PortVec,
    axis: toScene(p.axis),
    ...(p.ref ? { ref: toScene(p.ref) } : {}),
  }));
}

export function portsOf(part: ScenePart): Port[] {
  if (part.kind === 'component') return componentPorts(part.componentId);

  if (part.kind === 'hardware' && part.hardware) return hardwarePorts(part.hardware);

  return part.cad ? cadPorts(part.cad) : [];
}

export function findPort(part: ScenePart, name: string): Port | undefined {
  return portsOf(part).find((p) => p.name === name);
}

export interface WorldPort {
  position: V3;
  axis: V3;
}

export function worldPort(part: Pick<ScenePart, 'position' | 'rotation'>, port: Port): WorldPort {
  const m = eulerToMatrix(part.rotation);
  const p = new THREE.Vector3(...port.position).applyMatrix4(m).add(new THREE.Vector3(...part.position));
  const a = new THREE.Vector3(...port.axis).applyMatrix4(m).normalize();

  return { position: p.toArray() as V3, axis: a.toArray() as V3 };
}

const fmt = (v: V3) => `[${v.map((x) => r2(x) + 0).join(', ')}]`;

function holeText(p: Port): string {
  const bits = [
    p.thread,
    p.diameterMm ? `Ø${p.diameterMm}` : '',
    p.depthMm ? `${p.depthMm} deep` : '',
    p.count ? `${p.count}× on Ø${p.pitchDiameterMm}` : '',
  ].filter(Boolean);

  return bits.length ? ` ${bits.join(' ')}` : '';
}

export function portText(p: Port, at: WorldPort): string {
  return `${p.name} (${p.kind}${holeText(p)}) at ${fmt(toCad(at.position))} axis ${fmt(toCad(at.axis))}`;
}

const PATTERN = /-\d+$/;

export function portSummary(ports: Port[]): string {
  const counts = new Map<string, number>();

  for (const p of ports) {
    const name = PATTERN.test(p.name) ? p.name.replace(PATTERN, '') : p.name;
    const numbered = PATTERN.test(p.name) ? 1 : 0;

    counts.set(name, (counts.get(name) ?? 0) + numbered);
  }

  return [...counts].map(([name, n]) => (n ? `${name}-1…${n}` : name)).join(', ');
}

const LOCAL_AT_REST = { position: [0, 0, 0] as V3, rotation: [0, 0, 0] as V3 };

function groupLine(list: Port[]): string {
  const circle = list.find((p) => p.kind === 'hole_circle');

  if (circle) return `${portText(circle, worldPort(LOCAL_AT_REST, circle))}, holes ${circle.name}-1…${circle.count}`;

  if (list.length === 1) return portText(list[0], worldPort(LOCAL_AT_REST, list[0]));

  const base = list[0].name.replace(PATTERN, '');
  const at = list.map((p) => fmt(toCad(p.position))).join(' ');

  return `${base}-1…${list.length} (${list[0].kind}${holeText(list[0])}) at ${at} axis ${fmt(toCad(list[0].axis))}`;
}

export function catalogPortLines(ports: Port[]): string[] {
  const grouped = new Map<string, Port[]>();

  for (const p of ports) {
    const key = p.name.replace(PATTERN, '');

    grouped.set(key, [...(grouped.get(key) ?? []), p]);
  }

  return [...grouped.values()].map(groupLine);
}
