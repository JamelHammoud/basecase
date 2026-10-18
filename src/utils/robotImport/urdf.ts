import * as THREE from 'three';
import {
  displayRgb,
  elem,
  elems,
  nums,
  unitScale,
  type Geometry,
  type Model,
  type ModelJoint,
  type ModelLink,
  type Visual,
} from './model';

type ColorOf = (m: Element | null) => THREE.Color | undefined;

interface UrdfJoint extends Omit<ModelJoint, 'world' | 'after'> {
  origin: THREE.Matrix4;
}

function urdfOrigin(el: Element | null): THREE.Matrix4 {
  const [x, y, z] = nums(el?.getAttribute('xyz'), [0, 0, 0]);
  const [r, p, yw] = nums(el?.getAttribute('rpy'), [0, 0, 0]);
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(r, p, yw, 'ZYX'));

  return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), q, unitScale());
}

const attrNumber = (shape: Element, name: string) => Number(shape.getAttribute(name) ?? 0.01);

const URDF_SHAPES = new Map<string, (shape: Element) => Geometry>([
  [
    'mesh',
    (shape) => {
      const [sx, sy, sz] = nums(shape.getAttribute('scale'), [1, 1, 1]);

      return {
        type: 'mesh',
        file: shape.getAttribute('filename') ?? '',
        scale: new THREE.Vector3(sx, sy ?? sx, sz ?? sx),
      };
    },
  ],
  [
    'box',
    (shape) => {
      const [x, y, z] = nums(shape.getAttribute('size'), [0.01, 0.01, 0.01]);

      return { type: 'box', size: new THREE.Vector3(x, y, z) };
    },
  ],
  [
    'cylinder',
    (shape) => ({ type: 'cylinder', radius: attrNumber(shape, 'radius'), length: attrNumber(shape, 'length') }),
  ],
  ['sphere', (shape) => ({ type: 'sphere', radius: attrNumber(shape, 'radius') })],
  [
    'capsule',
    (shape) => ({ type: 'capsule', radius: attrNumber(shape, 'radius'), length: attrNumber(shape, 'length') }),
  ],
]);

function urdfVisual(v: Element, colorOf: ColorOf): Visual | null {
  const shape = elem(v, 'geometry')?.children[0];
  const make = shape ? URDF_SHAPES.get(shape.tagName) : undefined;

  if (!shape || !make) return null;

  return { geometry: make(shape), origin: urdfOrigin(elem(v, 'origin')), color: colorOf(elem(v, 'material')) };
}

function urdfLink(l: Element, colorOf: ColorOf): ModelLink {
  const visuals = elems(l, 'visual')
    .map((v) => urdfVisual(v, colorOf))
    .filter((v): v is Visual => !!v);
  const inertial = elem(l, 'inertial');
  const mass = Number(elem(inertial, 'mass')?.getAttribute('value'));
  const com = new THREE.Vector3(...nums(elem(inertial, 'origin')?.getAttribute('xyz'), [0, 0, 0]));

  return {
    world: new THREE.Matrix4(),
    visuals,
    mass: mass > 0 ? mass : undefined,
    com: mass > 0 ? com : undefined,
  };
}

const URDF_JOINT_TYPES = new Map<string, ModelJoint['type']>([
  ['revolute', 'revolute'],
  ['continuous', 'revolute'],
  ['prismatic', 'prismatic'],
]);

function positiveAttr(el: Element | null, name: string): number | undefined {
  const v = Number(el?.getAttribute(name));

  return v > 0 ? v : undefined;
}

function urdfLimit(t: string, lim: Element | null): [number, number] | undefined {
  const lo = lim?.getAttribute('lower');
  const hi = lim?.getAttribute('upper');

  const valid = t !== 'continuous' && lo != null && hi != null && Number(hi) > Number(lo);

  return valid ? [Number(lo), Number(hi)] : undefined;
}

function urdfJoint(j: Element): UrdfJoint | null {
  const parent = elem(j, 'parent')?.getAttribute('link');
  const child = elem(j, 'child')?.getAttribute('link');

  if (!parent || !child) return null;

  const t = j.getAttribute('type') ?? 'fixed';
  const lim = elem(j, 'limit');
  const [ax, ay, az] = nums(elem(j, 'axis')?.getAttribute('xyz'), [1, 0, 0]);

  return {
    name: j.getAttribute('name') ?? `${parent}-${child}`,
    type: URDF_JOINT_TYPES.get(t) ?? 'fixed',
    parent,
    child,
    origin: urdfOrigin(elem(j, 'origin')),
    axis: new THREE.Vector3(ax, ay, az).normalize(),
    limit: urdfLimit(t, lim),
    effort: positiveAttr(lim, 'effort'),
    velocity: positiveAttr(lim, 'velocity'),
  };
}

function urdfMaterials(robot: Element) {
  const materials = new Map<string, THREE.Color>();
  const colorOf: ColorOf = (m) => {
    if (!m) return undefined;

    const c = elem(m, 'color')?.getAttribute('rgba');

    if (!c) return materials.get(m.getAttribute('name') ?? '');

    const [r, g, b] = nums(c, [0.7, 0.7, 0.7]);

    return displayRgb(r, g, b);
  };

  for (const m of elems(robot, 'material')) {
    const c = colorOf(m);

    if (c) materials.set(m.getAttribute('name') ?? '', c);
  }

  return colorOf;
}

function linkTree(links: Map<string, ModelLink>, raw: UrdfJoint[], root: string): ModelJoint[] {
  const joints: ModelJoint[] = [];
  const walk = (link: string, world: THREE.Matrix4, depth: number) => {
    const l = links.get(link);

    if (l) l.world = world;

    if (depth > 200) return;

    for (const j of raw.filter((x) => x.parent === link)) {
      const jw = world.clone().multiply(j.origin);

      joints.push({
        name: j.name,
        type: j.type,
        parent: j.parent,
        child: j.child,
        world: jw,
        axis: j.axis,
        limit: j.limit,
        effort: j.effort,
        velocity: j.velocity,
      });
      walk(j.child, jw, depth + 1);
    }
  };

  walk(root, new THREE.Matrix4(), 0);

  return joints;
}

export function parseUrdf(doc: Document): Model {
  const robot = doc.documentElement;
  const colorOf = urdfMaterials(robot);
  const links = new Map<string, ModelLink>(
    elems(robot, 'link').map((l) => [l.getAttribute('name') ?? '', urdfLink(l, colorOf)]),
  );
  const raw = elems(robot, 'joint')
    .map(urdfJoint)
    .filter((j): j is UrdfJoint => !!j);
  const isChild = new Set(raw.map((j) => j.child));
  const root = [...links.keys()].find((l) => !isChild.has(l)) ?? [...links.keys()][0];
  const joints = linkTree(links, raw, root);

  return { name: robot.getAttribute('name') ?? 'Robot', links, joints, root };
}
