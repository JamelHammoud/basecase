import { CatalogItem, PartCategory } from '../types/robotics';
import {
  HARDWARE_TYPES,
  HardwareSpec,
  hardwareDimensions,
  hardwareName,
  makeSpec,
  hardwareColor,
  HardwareFinish,
  ScrewDrive,
} from './hardware';
import { COMPONENTS, ComponentGroup, componentNote, componentSize, hasComponentMesh } from './components';

export const CATEGORY_LABELS: Record<PartCategory, { label: string; short: string }> = {
  custom_models: { label: 'My Models', short: 'Mine' },
  actuators: { label: 'Motors', short: 'Motors' },
  structure: { label: 'Structure', short: 'Structure' },
  primitives: { label: 'Shapes', short: 'Shapes' },
  motion: { label: 'Hands & Grippers', short: 'Grippers' },
  sensors: { label: 'Electronics', short: 'Electronics' },
  perception: { label: 'Sensors & Cameras', short: 'Sensors' },
  ai_markers: { label: 'Cutouts & Guides', short: 'Guides' },
  hardware: { label: 'Hardware', short: 'Hardware' },
};

const COMPONENT_CATEGORY: Record<ComponentGroup, PartCategory> = {
  Servos: 'actuators',
  Motors: 'actuators',
  Computers: 'sensors',
  Microcontrollers: 'sensors',
  Drivers: 'sensors',
  Hands: 'motion',
  Grippers: 'motion',
  Sensors: 'perception',
  LiDAR: 'perception',
  'Depth Cameras': 'perception',
  Cameras: 'perception',
};

export const PART_CATALOG: CatalogItem[] = [


  // Basic Primitives
  {
    kind: 'box',
    name: 'Plate',
    category: 'primitives',
    defaultRole: 'solid',
    defaultDimensions: { width: 70, height: 6, depth: 50 },
    defaultColor: '#e4e4e7',
    defaultTag: '3D Printed PLA/PETG',
    description: 'Resizable base plate, wall, or enclosure block',
  },
  {
    kind: 'cube',
    name: 'Cube',
    category: 'primitives',
    defaultRole: 'solid',
    defaultDimensions: { width: 30, height: 30, depth: 30 },
    defaultColor: '#e4e4e7',
    defaultTag: '3D Printed PLA/PETG',
    description: 'Equal-sided block',
  },
  {
    kind: 'cylinder',
    name: 'Shaft',
    category: 'primitives',
    defaultRole: 'solid',
    defaultDimensions: { width: 12, height: 50, depth: 12 },
    defaultColor: '#e4e4e7',
    defaultTag: '3D Printed PLA/PETG',
    description: 'Solid cylinder for axles, pins, or pillars',
  },
  {
    kind: 'tube',
    name: 'Tube',
    category: 'primitives',
    defaultRole: 'solid',
    defaultDimensions: { width: 28, height: 24, depth: 28, thickness: 4 },
    defaultColor: '#e4e4e7',
    defaultTag: '3D Printed PLA/PETG',
    description: 'Pipe, sleeve, or bearing housing ring',
  },
  {
    kind: 'wedge',
    name: 'Wedge',
    category: 'primitives',
    defaultRole: 'solid',
    defaultDimensions: { width: 30, height: 30, depth: 16 },
    defaultColor: '#e4e4e7',
    defaultTag: '3D Printed PLA/PETG',
    description: 'Angled rib or ramp for corner reinforcement',
  },
  {
    kind: 'sphere',
    name: 'Sphere',
    category: 'primitives',
    defaultRole: 'solid',
    defaultDimensions: { width: 24, height: 24, depth: 24 },
    defaultColor: '#e4e4e7',
    defaultTag: '3D Printed PLA/PETG',
    description: 'Spherical ball joint, caster, or dome',
  },
  {
    kind: 'cone',
    name: 'Cone',
    category: 'primitives',
    defaultRole: 'solid',
    defaultDimensions: { width: 30, height: 36, depth: 30 },
    defaultColor: '#e4e4e7',
    defaultTag: '3D Printed PLA/PETG',
    description: 'Round base tapering to a point',
  },
  {
    kind: 'pyramid',
    name: 'Pyramid',
    category: 'primitives',
    defaultRole: 'solid',
    defaultDimensions: { width: 32, height: 28, depth: 32 },
    defaultColor: '#e4e4e7',
    defaultTag: '3D Printed PLA/PETG',
    description: 'Square base tapering to a point',
  },
  {
    kind: 'hex_prism',
    name: 'Hex Prism',
    category: 'primitives',
    defaultRole: 'solid',
    defaultDimensions: { width: 28, height: 16, depth: 28 },
    defaultColor: '#e4e4e7',
    defaultTag: '3D Printed PLA/PETG',
    description: 'Hexagonal block, e.g. a nut trap',
  },
  {
    kind: 'capsule',
    name: 'Capsule',
    category: 'primitives',
    defaultRole: 'solid',
    defaultDimensions: { width: 20, height: 48, depth: 20 },
    defaultColor: '#e4e4e7',
    defaultTag: '3D Printed PLA/PETG',
    description: 'Cylinder with rounded ends',
  },
  {
    kind: 'dome',
    name: 'Dome',
    category: 'primitives',
    defaultRole: 'solid',
    defaultDimensions: { width: 40, height: 20, depth: 40 },
    defaultColor: '#e4e4e7',
    defaultTag: '3D Printed PLA/PETG',
    description: 'Half sphere with a flat base',
  },
  {
    kind: 'torus',
    name: 'Ring',
    category: 'primitives',
    defaultRole: 'solid',
    defaultDimensions: { width: 36, height: 10, depth: 36 },
    defaultColor: '#e4e4e7',
    defaultTag: '3D Printed PLA/PETG',
    description: 'O-ring, bumper or collar',
  },


  // Sensors & Electronics

  // AI Intent Markers
  {
    kind: 'hole_cylinder',
    name: 'Hole',
    category: 'ai_markers',
    defaultRole: 'cutout',
    defaultDimensions: { width: 10, height: 30, depth: 10 },
    defaultColor: '#ef4444',
    defaultTag: 'Cutout / Clearance',
    description: 'Overlap a part to mark a round hole',
  },
  {
    kind: 'hole_box',
    name: 'Slot',
    category: 'ai_markers',
    defaultRole: 'cutout',
    defaultDimensions: { width: 24, height: 20, depth: 16 },
    defaultColor: '#ef4444',
    defaultTag: 'Cutout / Clearance',
    description: 'Overlap a part to mark a slot or pocket',
  },
  {
    kind: 'pivot_axis',
    name: 'Pivot Axis',
    category: 'ai_markers',
    defaultRole: 'reference',
    defaultDimensions: { width: 6, height: 90, depth: 6 },
    defaultColor: '#06b6d4',
    defaultTag: 'Reference Axis',
    description: 'Marks a rotation or alignment axis',
  },

  // Real components with their exact CAD models (data/components.ts)
  ...COMPONENTS.filter((c) => hasComponentMesh(c.id)).map(
    (c): CatalogItem => ({
      kind: 'component',
      name: c.name,
      category: COMPONENT_CATEGORY[c.group],
      defaultRole: 'solid',
      defaultDimensions: componentSize(c.id),
      defaultColor: c.color,
      defaultTag: 'Off-the-shelf COTS',
      description: c.description,
      componentId: c.id,
      keywords: `${c.manufacturer} ${c.mpn} ${c.group} ${c.keywords ?? ''}`,
    })
  ),

  // Hardware: one entry per type at its default size; size/length are chosen in Parts or Inspect
  ...HARDWARE_TYPES.map((t): CatalogItem => {
    const spec = makeSpec(t.type);
    return {
      kind: 'hardware',
      name: t.name,
      category: 'hardware',
      defaultRole: 'solid',
      defaultDimensions: hardwareDimensions(spec),
      defaultColor: hardwareColor(spec),
      defaultTag: 'Off-the-shelf COTS',
      description: t.description,
      hardware: spec,
    };
  }),
];

/** Stable id for a catalog entry (hardware and component entries share a kind) */
export const catalogKey = (item: CatalogItem): string =>
  item.hardware ? `hardware:${item.hardware.type}` : item.componentId ? `component:${item.componentId}` : item.kind;

/**
 * Resolves a key like "component:raspberry-pi-5", "hardware:socket_head|M2.5|6" or "box"
 * (also drag payloads) to a catalog entry at that size.
 */
export function catalogItemFromKey(ref: string): CatalogItem | undefined {
  const [key, size, length, finish, drive] = ref.split('|');
  const base = PART_CATALOG.find((c) => catalogKey(c) === key);
  return base?.hardware
    ? hardwareVariant(base, makeSpec(
        base.hardware.type,
        size || undefined,
        length ? Number(length) : undefined,
        (finish || undefined) as HardwareFinish,
        (drive || undefined) as ScrewDrive,
      ))
    : base;
}

/** Key for an entry at its exact size (drag payloads, recents, thumbnails): "hardware:type|size|length|finish|drive" */
export function catalogRef(item: CatalogItem): string {
  const h = item.hardware;
  return h ? `${catalogKey(item)}|${h.size}|${h.length ?? ''}|${h.finish ?? ''}${h.drive ? `|${h.drive}` : ''}` : catalogKey(item);
}

/** Notes that start a new part from this entry */
export function catalogNote(item: CatalogItem): string {
  const c = item.componentId ? COMPONENTS.find((x) => x.id === item.componentId) : undefined;
  return c ? componentNote(c) : '';
}

/** The hardware entry for an exact spec (type, size, length, finish, drive) */
export function hardwareVariant(item: CatalogItem, spec: HardwareSpec): CatalogItem;
export function hardwareVariant(item: CatalogItem, size?: string, length?: number): CatalogItem;
export function hardwareVariant(item: CatalogItem, a?: string | HardwareSpec, length?: number): CatalogItem {
  if (!item.hardware) return item;
  const spec: HardwareSpec =
    typeof a === 'object'
      ? makeSpec(a.type, a.size, a.length, a.finish, a.drive)
      : makeSpec(item.hardware.type, a ?? item.hardware.size, length, item.hardware.finish, item.hardware.drive);
  const base = PART_CATALOG.find((c) => c.hardware?.type === spec.type) ?? item;
  return {
    ...base,
    hardware: spec,
    defaultDimensions: hardwareDimensions(spec),
    defaultColor: hardwareColor(spec),
    name: hardwareName(spec),
  };
}

/**
 * Generic, estimated stand-ins. Not listed in Parts (it only offers exact parts: real
 * components, ISO hardware, and shapes you size yourself), but the agent can still use them as
 * block-out shapes and old scenes that contain them still render.
 */
export const BLOCKOUT_ONLY: CatalogItem[] = [
  {
    kind: 'hinge_joint',
    name: 'Hinge',
    category: 'actuators',
    defaultRole: 'solid',
    defaultDimensions: { width: 28, height: 34, depth: 24 },
    defaultColor: '#f97316',
    defaultTag: '3D Printed PLA/PETG',
    description: 'Knuckle joint with a visible axis',
  },
  {
    kind: 'linear_actuator',
    name: 'Linear Actuator',
    category: 'actuators',
    defaultRole: 'solid',
    defaultDimensions: { width: 20, height: 75, depth: 20 },
    defaultColor: '#52525b',
    defaultTag: 'Off-the-shelf COTS',
    description: 'Push–pull cylinder with rod',
  },
  {
    kind: 'l_bracket',
    name: 'L-Bracket',
    category: 'structure',
    defaultRole: 'solid',
    defaultDimensions: { width: 40, height: 40, depth: 30, thickness: 4 },
    defaultColor: '#e4e4e7',
    defaultTag: '3D Printed PLA/PETG',
    description: 'Right-angle bracket with set wall thickness',
  },
  {
    kind: 'u_bracket',
    name: 'U-Bracket',
    category: 'structure',
    defaultRole: 'solid',
    defaultDimensions: { width: 52, height: 40, depth: 24, thickness: 4 },
    defaultColor: '#d4d4d8',
    defaultTag: '3D Printed PLA/PETG',
    description: 'Cradle for servo joints and linkages',
  },
  {
    kind: 'beam',
    name: 'Beam',
    category: 'structure',
    defaultRole: 'solid',
    defaultDimensions: { width: 100, height: 14, depth: 14 },
    defaultColor: '#a1a1aa',
    defaultTag: '3D Printed PLA/PETG',
    description: 'Perforated robotics frame bar with mounting holes',
  },
  {
    kind: 'standoff',
    name: 'Standoff',
    category: 'structure',
    defaultRole: 'solid',
    defaultDimensions: { width: 8, height: 30, depth: 8 },
    defaultColor: '#eab308',
    defaultTag: 'Off-the-shelf COTS',
    description: 'Hexagonal spacer pillar for stacking plates',
  },
  {
    kind: 'gripper',
    name: 'Gripper',
    category: 'motion',
    defaultRole: 'solid',
    defaultDimensions: { width: 54, height: 42, depth: 22 },
    defaultColor: '#18181b',
    defaultTag: '3D Printed PLA/PETG',
    description: 'Parallel two-finger claw',
  },
  {
    kind: 'wheel',
    name: 'Wheel',
    category: 'motion',
    defaultRole: 'solid',
    defaultDimensions: { width: 60, height: 22, depth: 60 },
    defaultColor: '#27272a',
    defaultTag: 'Off-the-shelf COTS',
    description: 'Wheel with tread and hub',
  },
  {
    kind: 'bearing_block',
    name: 'Bearing Block',
    category: 'motion',
    defaultRole: 'solid',
    defaultDimensions: { width: 44, height: 24, depth: 14 },
    defaultColor: '#71717a',
    defaultTag: '3D Printed PLA/PETG',
    description: 'Flanged shaft support with bore',
  },
  {
    kind: 'servo',
    name: 'Standard Servo',
    category: 'actuators',
    defaultRole: 'solid',
    defaultDimensions: { width: 40, height: 36, depth: 20 },
    defaultColor: '#27272a',
    defaultTag: 'Off-the-shelf COTS',
    description: 'Hobby servo with mounting tabs and horn',
  },
  {
    kind: 'stepper_motor',
    name: 'Stepper Motor',
    category: 'actuators',
    defaultRole: 'solid',
    defaultDimensions: { width: 42, height: 38, depth: 42 },
    defaultColor: '#3f3f46',
    defaultTag: 'Off-the-shelf COTS',
    description: 'NEMA-style motor with flange and shaft',
  },
  {
    kind: 'camera_module',
    name: 'Camera',
    category: 'sensors',
    defaultRole: 'solid',
    defaultDimensions: { width: 32, height: 28, depth: 18 },
    defaultColor: '#2563eb',
    defaultTag: 'Off-the-shelf COTS',
    description: 'Camera board with lens',
  },
  {
    kind: 'ultrasonic',
    name: 'Ultrasonic Sensor',
    category: 'sensors',
    defaultRole: 'solid',
    defaultDimensions: { width: 45, height: 20, depth: 16 },
    defaultColor: '#0284c7',
    defaultTag: 'Off-the-shelf COTS',
    description: 'Two-transducer rangefinder',
  },
  {
    kind: 'pcb_board',
    name: 'Board',
    category: 'sensors',
    defaultRole: 'solid',
    defaultDimensions: { width: 65, height: 12, depth: 48 },
    defaultColor: '#16a34a',
    defaultTag: 'Off-the-shelf COTS',
    description: 'MCU, driver or battery envelope',
  },
];
