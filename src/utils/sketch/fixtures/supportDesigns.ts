import * as THREE from 'three';
import { specToPart, type AgentCadPayload } from '../../../agent/agentScene';
import { buildPartGroup, releasePartGroup } from '../../../three/buildPartMesh';
import { localTriangles } from '../../../three/meshMeasure';
import type { ScenePart } from '../../../types/robotics';
import { addCircle, addRectangle, withConstraints } from '../edit';
import { placedPlane } from '../face';
import { partFromSolid, sketchSolid, type Vec3 } from '../placement';
import { captureSupport } from '../support';

export interface SupportDesign {
  name: string;
  size: readonly number[];
  feature: readonly number[];
  holes: number;
  offset: boolean;
  round?: boolean;
}

export const SUPPORT_DESIGNS: readonly SupportDesign[] = [
  { name: 'Rover deck and battery pocket', size: [160, 6, 100], feature: [50, 30, -4], holes: 0, offset: true },
  { name: 'Arm pedestal and mounting holes', size: [70, 20, 70], feature: [40, 40, 8], holes: 4, offset: false },
  { name: 'Quadruped hip bracket', size: [60, 12, 44], feature: [30, 24, 5], holes: 2, offset: true },
  {
    name: 'Hexapod body and electronics standoffs',
    round: true,
    size: [180, 8, 120],
    feature: [12, 12, 16],
    holes: 1,
    offset: true,
  },
  { name: 'Pan-tilt camera mount', size: [56, 6, 40], feature: [24, 20, 4], holes: 2, offset: false },
  { name: 'Gripper jaw pad', size: [64, 8, 28], feature: [40, 16, 3], holes: 0, offset: false },
  { name: 'Sensor enclosure lid', size: [100, 4, 64], feature: [72, 40, 3], holes: 4, offset: true },
  { name: 'Wheel hub flange', round: true, size: [50, 18, 50], feature: [36, 36, 5], holes: 4, offset: false },
  { name: 'Linkage ground plate', size: [120, 10, 60], feature: [80, 32, 6], holes: 2, offset: true },
  { name: 'Appliance service opening', size: [140, 8, 100], feature: [70, 50, -8], holes: 0, offset: true },
] as const;

export function generatedCad(size: readonly number[], segments = 1): AgentCadPayload {
  const geometry = new THREE.BoxGeometry(size[0], size[1], size[2], segments, segments, segments);
  const source = geometry.getAttribute('position').array;
  const positions: number[] = [];

  for (let i = 0; i < source.length; i += 3) positions.push(source[i], -source[i + 2], source[i + 1]);

  const result: AgentCadPayload = {
    language: 'openscad',
    code: `cube([${size[0]},${size[2]},${size[1]}], center=true);`,
    positions,
    indices: Array.from(geometry.index!.array),
  };

  geometry.dispose();

  return result;
}

export function partSoup(part: ScenePart) {
  const group = buildPartGroup({ ...part, position: [0, 0, 0], rotation: [0, 0, 0] }, false, { lateEdges: true });

  try {
    return localTriangles(group);
  } finally {
    releasePartGroup(group);
  }
}

export function mountingFeature(
  source: ScenePart,
  design: Pick<SupportDesign, 'name' | 'feature' | 'holes' | 'offset' | 'round'>,
  id = 'feature',
) {
  const capture = captureSupport(source, partSoup(source), { normal: [0, 1, 0] })!;
  const [width, depth, height] = design.feature;
  const start: [number, number] = design.offset
    ? [-source.dimensions.width / 2 + 8, -source.dimensions.depth / 2 + 8]
    : [-width / 2, -depth / 2];
  const outline = design.round
    ? addCircle(capture.reference, { at: [start[0] + width / 2, start[1] + depth / 2] }, width / 2, true)!
    : addRectangle(capture.reference, {
        corner: { at: start },
        opposite: [start[0] + width, start[1] + depth],
        width,
        height: depth,
      })!;
  let sketch = outline.sketch;
  const corner = sketch.points.find((p) => !p.fixed)!;
  const margin = design.round ? 8 + width / 2 : 8;

  if (design.offset)
    sketch = withConstraints(sketch, [
      { kind: 'distance', a: corner.id, b: 'e4', value: margin },
      { kind: 'distance', a: corner.id, b: 'e1', value: margin },
    ]);

  for (let i = 0; i < design.holes; i++) {
    const x = start[0] + width * (i % 2 ? 0.75 : 0.25);
    const y = start[1] + depth * (i > 1 ? 0.75 : 0.25);
    const center = design.round && design.holes === 1 ? { id: corner.id } : { at: [x, y] as [number, number] };

    sketch = addCircle(sketch, center, 2, true)!.sketch;

    if (!('lines' in outline)) continue;

    const point = sketch.points.at(-1)!;

    sketch = withConstraints(sketch, [
      { kind: 'distance', a: point.id, b: outline.lines[3], value: x - start[0] },
      { kind: 'distance', a: point.id, b: outline.lines[0], value: y - start[1] },
    ]);
  }

  const solid = sketchSolid(
    placedPlane(capture.face.plane, source),
    { sketch, mode: 'extrude', depth: height },
    { id: `${id}-node`, name: design.name, color: '#999999' },
  )!;
  const base = {
    ...source,
    id,
    kind: 'custom_model' as const,
    cad: undefined,
    name: design.name,
    mechanicalTag: '3D Printed PLA/PETG',
    massG: 12,
    print: { copies: 2 },
    note: 'Keep service access',
  };
  const part = partFromSolid(base, solid);

  return { ...part, sketch: { ...part.sketch!, support: capture.support } };
}

export function supportDesign(index: number) {
  const design = SUPPORT_DESIGNS[index];
  const source = specToPart({
    id: 'source',
    shape: 'cad_part',
    name: design.name,
    cad: generatedCad(design.size),
    position: [0, 0, 0],
  });
  const feature = mountingFeature(source, design);
  const servoCount = [0, 1, 4, 6, 2, 1, 0, 0, 0, 0][index];
  const screwCount = [4, 4, 4, 6, 2, 2, 4, 4, 4, 4][index];
  const servos = Array.from({ length: servoCount }, (_, i) => {
    const part = specToPart({ id: `servo-${i}`, catalog: 'component:feetech-sts3215|c018' });

    return {
      ...part,
      position: [(i - (servoCount - 1) / 2) * 48, -part.dimensions.height / 2 - design.size[1] / 2, 0] as Vec3,
    };
  });
  const screws = Array.from({ length: screwCount }, (_, i) => {
    const part = specToPart({ id: `screw-${i}`, catalog: 'hardware:socket_head|M3|12' });

    return {
      ...part,
      position: [(i % 2 ? 1 : -1) * design.size[0] * 0.35, -4, (i > 1 ? 1 : -1) * design.size[2] * 0.35] as Vec3,
    };
  });
  const supports = contextGeometry(source, index);

  return { design, source, feature, parts: [source, feature, ...servos, ...screws, ...supports] };
}

function contextGeometry(source: ScenePart, index: number): ScenePart[] {
  if (index === 0)
    return Array.from({ length: 4 }, (_, i) => ({
      ...source,
      id: `wheel-${i}`,
      name: 'Wheel',
      kind: 'cylinder',
      cad: undefined,
      position: [i % 2 ? 60 : -60, -20, i > 1 ? 55 : -55] as Vec3,
      rotation: [90, 0, 0] as Vec3,
      dimensions: { width: 40, height: 18, depth: 40 },
    }));

  if (index === 7)
    return [
      {
        ...source,
        id: 'hub',
        name: 'Hub',
        kind: 'cylinder',
        cad: undefined,
        position: [0, -16, 0],
        dimensions: { width: 24, height: 24, depth: 24 },
      },
    ];

  if (index === 6 || index === 9)
    return [-1, 1].map((sign) => ({
      ...source,
      id: `wall-${sign}`,
      name: 'Enclosure wall',
      kind: 'box',
      cad: undefined,
      position: [sign * (source.dimensions.width / 2 - 2), -20, 0] as Vec3,
      dimensions: { width: 4, height: 36, depth: source.dimensions.depth },
    }));

  if (index === 8)
    return [-1, 1].map((sign) => ({
      ...source,
      id: `pivot-${sign}`,
      name: 'Linkage pivot',
      kind: 'cylinder',
      cad: undefined,
      position: [sign * 35, -14, 0] as Vec3,
      dimensions: { width: 8, height: 18, depth: 8 },
    }));

  return [];
}
