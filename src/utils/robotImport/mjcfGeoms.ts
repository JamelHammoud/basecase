import * as THREE from 'three';
import { placement, type Attrs, type MjAngles } from './mjcfFrames';
import { displayRgb, nums, unitScale, type Geometry, type Visual } from './model';

export interface MjMesh {
  file: string;
  scale: THREE.Vector3;
}

export interface MjGeom {
  link: string;
  attrs: Attrs;
  cls: string;
  frame?: THREE.Matrix4;
}

interface GeomContext extends MjAngles {
  meshes: Map<string, MjMesh>;
  materials: Map<string, THREE.Color>;
}

interface Shape {
  geometry: Geometry;
  origin?: THREE.Matrix4;
}

type ShapeMaker = (size: number[], a: Attrs, ctx: GeomContext) => Shape | null;

const isVisualOnly = (g: MjGeom) =>
  /visual/i.test(g.cls) || (g.attrs('contype') === '0' && g.attrs('conaffinity') === '0');

export function pickVisualGeoms(geoms: MjGeom[]): MjGeom[] {
  const candidates = geoms.filter(
    (g) => !/collision/i.test(g.cls) && g.attrs('group') !== '3' && !/collision/i.test(g.attrs('name') ?? ''),
  );

  return candidates.some(isVisualOnly) ? candidates.filter(isVisualOnly) : candidates;
}

function tubeShape(type: 'cylinder' | 'capsule'): ShapeMaker {
  return (size, a) => {
    if (!a('fromto')) return { geometry: { type, radius: size[0], length: (size[1] ?? 0.01) * 2 } };

    const [x1, y1, z1, x2, y2, z2] = nums(a('fromto'), [0, 0, 0, 0, 0, 0]);
    const p1 = new THREE.Vector3(x1, y1, z1),
      p2 = new THREE.Vector3(x2, y2, z2);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), p2.clone().sub(p1).normalize());
    const origin = new THREE.Matrix4().compose(p1.clone().add(p2).multiplyScalar(0.5), q, unitScale());

    return { geometry: { type, radius: size[0], length: p1.distanceTo(p2) }, origin };
  };
}

const GEOM_SHAPES = new Map<string, ShapeMaker>([
  [
    'mesh',
    (_size, a, ctx) => {
      const m = ctx.meshes.get(a('mesh') ?? '');

      return m ? { geometry: { type: 'mesh', file: m.file, scale: m.scale } } : null;
    },
  ],
  [
    'box',
    (size) => ({
      geometry: {
        type: 'box',
        size: new THREE.Vector3(size[0] * 2, (size[1] ?? size[0]) * 2, (size[2] ?? size[0]) * 2),
      },
    }),
  ],
  ['sphere', (size) => ({ geometry: { type: 'sphere', radius: size[0] } })],
  [
    'ellipsoid',
    (size) => ({
      geometry: { type: 'ellipsoid', radii: new THREE.Vector3(size[0], size[1] ?? size[0], size[2] ?? size[0]) },
    }),
  ],
  ['cylinder', tubeShape('cylinder')],
  ['capsule', tubeShape('capsule')],
]);

function geomColor(a: Attrs, ctx: GeomContext): THREE.Color | undefined {
  const rgba = a('rgba');

  if (rgba) return displayRgb(...(nums(rgba, [0.5, 0.5, 0.5]).slice(0, 3) as [number, number, number]));

  return ctx.materials.get(a('material') ?? '');
}

export function mjGeomVisual(g: MjGeom, ctx: GeomContext): Visual | null {
  const a = g.attrs;
  const type = a('type') ?? (a('mesh') ? 'mesh' : 'sphere');
  const shape = GEOM_SHAPES.get(type)?.(nums(a('size'), [0.005, 0.005, 0.005]), a, ctx);

  if (!shape) return null;

  const origin = shape.origin ?? placement(a, ctx);

  return {
    geometry: shape.geometry,
    origin: g.frame ? g.frame.clone().multiply(origin) : origin,
    color: geomColor(a, ctx),
  };
}
