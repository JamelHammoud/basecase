import * as THREE from 'three';
import { hardwareDimensions, type HardwareSpec } from '../../data/hardware';
import { fastenerSpec, type ScrewSpec } from '../../assembly/fastenerSpec';
import type { PrintMaterial, RobotJoint, ScenePart } from '../../types/robotics';

type V3 = [number, number, number];

interface Hole {
  x: number;
  z: number;
  r: number;
}

interface Layer {
  y0: number;
  y1: number;
  pocket?: { w: number; d: number };
  holes: Hole[];
}

const SIZE = { w: 66, d: 41 };
const POCKET = { w: 46, d: 25.5 };
const FLOOR = 8;
const RING_TOP = 44;
const LID = 4;
const PLATE = 4;
const CORNERS: Array<[number, number]> = [
  [-28, -12],
  [-28, 12],
  [28, -12],
  [28, 12],
];
const M3x10: HardwareSpec = { type: 'socket_head', size: 'M3', length: 10 };
const INSERT: HardwareSpec = { type: 'heat_insert', size: 'M3', length: 5.7 };
const INSERT_HALF = 2.85;
const UPSIDE_DOWN: V3 = [180, 0, 0];

function hardware(id: string, spec: HardwareSpec, at: V3): ScenePart {
  const dims = hardwareDimensions(spec);

  return {
    id,
    name: id,
    kind: 'hardware',
    category: 'hardware',
    role: 'solid',
    position: at,
    rotation: [0, 0, 0],
    dimensions: { width: dims.width, height: dims.height, depth: dims.depth },
    color: '#eeeeee',
    note: '',
    visible: true,
    locked: false,
    hardware: spec,
  };
}

function rect(w: number, d: number): THREE.Vector2[] {
  return [
    new THREE.Vector2(-w / 2, -d / 2),
    new THREE.Vector2(w / 2, -d / 2),
    new THREE.Vector2(w / 2, d / 2),
    new THREE.Vector2(-w / 2, d / 2),
  ];
}

function layerTriangles({ y0, y1, pocket, holes }: Layer): number[] {
  const shape = new THREE.Shape(rect(SIZE.w, SIZE.d));

  if (pocket) shape.holes.push(new THREE.Path(rect(pocket.w, pocket.d).reverse()));

  for (const h of holes) shape.holes.push(new THREE.Path().absarc(h.x, -h.z, h.r, 0, Math.PI * 2, true));

  const g = new THREE.ExtrudeGeometry(shape, { depth: y1 - y0, bevelEnabled: false, curveSegments: 24 })
    .rotateX(-Math.PI / 2)
    .translate(0, y0, 0);
  const flat = g.index ? g.toNonIndexed() : g;

  return Array.from(flat.attributes.position.array as Float32Array);
}

function printedPart(id: string, name: string, layers: Layer[], material?: PrintMaterial): ScenePart {
  const positions = layers.flatMap(layerTriangles);
  const top = Math.max(...layers.map((l) => l.y1));
  const bottom = Math.min(...layers.map((l) => l.y0));

  return {
    id,
    name,
    kind: 'cad_part',
    category: 'structure',
    role: 'solid',
    position: [0, bottom, 0],
    rotation: [0, 0, 0],
    dimensions: { width: SIZE.w, height: top - bottom, depth: SIZE.d },
    color: '#eeeeee',
    note: '',
    visible: true,
    locked: false,
    ...(material ? { printMaterial: material } : {}),
    cad: {
      language: 'openscad',
      code: '',
      positions: positions.map((v, i) => (i % 3 === 1 ? v - bottom : v)),
      indices: Array.from({ length: positions.length / 3 }, (_, i) => i),
      originOffset: [0, 0, 0],
      baseSize: [SIZE.w, top - bottom, SIZE.d],
    },
  };
}

const holes = (r: number) => CORNERS.map(([x, z]) => ({ x, z, r }));

function screw(id: string, x: number, z: number, seat: { y: number; down: boolean }): ScenePart {
  const s = fastenerSpec(hardware(id, M3x10, [0, 0, 0])) as ScrewSpec;
  const y = seat.down ? seat.y - s.underY : seat.y + s.underY;

  return { ...hardware(id, M3x10, [x, y, z]), ...(seat.down ? {} : { rotation: UPSIDE_DOWN }) };
}

const servo = (): ScenePart => ({
  ...hardware('servo', M3x10, [0, 0, 0]),
  name: 'Knee Servo',
  kind: 'component',
  category: 'actuators',
  hardware: undefined,
  position: [0, FLOOR + 18, 0],
  dimensions: { width: 45.2, height: 35, depth: 24.7 },
});

export interface MergeFixtureOptions {
  plateMaterial?: PrintMaterial;
}

export function shinFixture({ plateMaterial }: MergeFixtureOptions = {}): ScenePart[] {
  const tray = printedPart('tray', 'Shin Bracket', [
    { y0: 0, y1: FLOOR, holes: holes(2) },
    { y0: FLOOR, y1: RING_TOP, pocket: POCKET, holes: holes(2) },
  ]);
  const lid = printedPart('lid', 'Servo Cover', [{ y0: RING_TOP, y1: RING_TOP + LID, holes: holes(1.7) }]);
  const plate = printedPart('plate', 'Foot Plate', [{ y0: -PLATE, y1: 0, holes: holes(1.7) }], plateMaterial);

  return [
    tray,
    lid,
    plate,
    servo(),
    ...CORNERS.map(([x, z], i) => hardware(`lid-insert-${i + 1}`, INSERT, [x, RING_TOP - INSERT_HALF, z])),
    ...CORNERS.map(([x, z], i) => screw(`lid-screw-${i + 1}`, x, z, { y: RING_TOP + LID, down: true })),
    ...CORNERS.map(([x, z], i) => ({
      ...hardware(`plate-insert-${i + 1}`, INSERT, [x, INSERT_HALF, z]),
      rotation: UPSIDE_DOWN,
    })),
    ...CORNERS.map(([x, z], i) => screw(`plate-screw-${i + 1}`, x, z, { y: -PLATE, down: false })),
  ];
}

const SPACING = 140;

export function quadrupedFixture(): { parts: ScenePart[]; joints: RobotJoint[] } {
  const legs = ['fl', 'fr', 'rl', 'rr'].map((leg, i) => {
    const dx = (i % 2 ? 1 : -1) * SPACING;
    const dz = (i < 2 ? 1 : -1) * SPACING;
    const parts = shinFixture().map((p) => ({
      ...p,
      id: `${leg}-${p.id}`,
      name: `${leg.toUpperCase()} ${p.name}`,
      position: [p.position[0] + dx, p.position[1], p.position[2] + dz] as V3,
    }));
    const joint: RobotJoint = {
      id: `${leg}-knee`,
      name: `${leg.toUpperCase()} Knee`,
      type: 'revolute',
      parent: ['body'],
      child: parts.filter((p) => p.kind !== 'hardware').map((p) => p.id),
      origin: [dx, 60, dz],
      axis: [1, 0, 0],
    };

    return { parts, joint };
  });
  const body = printedPart('body', 'Body', [{ y0: 60, y1: 80, holes: [] }]);

  return {
    parts: [{ ...body, dimensions: { ...body.dimensions } }, ...legs.flatMap((l) => l.parts)],
    joints: legs.map((l) => l.joint),
  };
}
