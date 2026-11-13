import * as THREE from 'three';
import type { CustomModelSubNode, PartDimensions, ScenePart } from '../../types/robotics';
import { loopBounds, sketchProfile, type Profile } from './profile';
import type { PartSketch, Sketch, SketchMode, Vec2 } from './types';

export type Vec3 = [number, number, number];

export interface SketchPlane {
  origin: Vec3;
  u: Vec3;
  v: Vec3;
  n: Vec3;
}

export const GROUND_PLANE: SketchPlane = { origin: [0, 0, 0], u: [1, 0, 0], v: [0, 0, -1], n: [0, 1, 0] };

export interface SketchShape {
  sketch: Sketch;
  mode: SketchMode;
  depth: number;
}

export interface SketchSolid {
  position: Vec3;
  rotation: Vec3;
  dimensions: PartDimensions;
  role: 'solid' | 'cutout';
  node: CustomModelSubNode;
  record: PartSketch;
}

const MIN_SPAN = 0.01;

const v3 = (v: Vec3) => new THREE.Vector3(...v);
const tidy = (v: number, step = 1e-6) => Math.round(v / step) * step + 0;
const tidyVec = (v: THREE.Vector3 | Vec3): Vec3 => {
  const [x, y, z] = Array.isArray(v) ? v : [v.x, v.y, v.z];

  return [tidy(x), tidy(y), tidy(z)];
};

const partFrame = (u: Vec3, n: Vec3, v: Vec3) => new THREE.Matrix4().makeBasis(v3(u), v3(n), v3(v).multiplyScalar(-1));

function rotationOf(basis: THREE.Matrix4): Vec3 {
  const e = new THREE.Euler().setFromRotationMatrix(basis, 'XYZ');

  return tidyVec([THREE.MathUtils.radToDeg(e.x), THREE.MathUtils.radToDeg(e.y), THREE.MathUtils.radToDeg(e.z)]);
}

const planePoint = (plane: SketchPlane, [x, y]: Vec2, lift: number) =>
  v3(plane.origin).addScaledVector(v3(plane.u), x).addScaledVector(v3(plane.v), y).addScaledVector(v3(plane.n), lift);

const normalized = (loop: Vec2[], center: Vec2, span: Vec2): Array<[number, number]> =>
  loop.map(([x, y]) => [(x - center[0]) / span[0], -(y - center[1]) / span[1]]);

interface Body {
  dims: PartDimensions;
  anchor: Vec2;
  lift: number;
  node: Pick<CustomModelSubNode, 'nodeType' | 'contour' | 'lathe'>;
}

function extrudeBody(profile: Profile, depth: number): Body | null {
  const { min, max } = loopBounds(profile.outer);
  const span: Vec2 = [max[0] - min[0], max[1] - min[1]];
  const height = Math.abs(depth);

  if (span[0] < MIN_SPAN || span[1] < MIN_SPAN || height < MIN_SPAN) return null;

  const center: Vec2 = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2];

  return {
    dims: { width: span[0], height, depth: span[1] },
    anchor: center,
    lift: depth >= 0 ? height / 2 : -height / 2,
    node: {
      nodeType: 'contour_extrude',
      contour: {
        outerLoop: normalized(profile.outer, center, span),
        holes: profile.holes.map((h) => normalized(h, center, span)),
        bevel: false,
      },
    },
  };
}

function revolveBody(profile: Profile): Body | null {
  const radius = Math.max(...profile.outer.map(([x]) => Math.abs(x)));
  const { min, max } = loopBounds(profile.outer);
  const height = max[1] - min[1];

  if (radius < MIN_SPAN || height < MIN_SPAN) return null;

  const mid = (min[1] + max[1]) / 2;

  return {
    dims: { width: radius * 2, height, depth: radius * 2 },
    anchor: [0, 0],
    lift: height / 2,
    node: {
      nodeType: 'lathe',
      lathe: {
        profilePoints: profile.outer.map(([x, y]) => [Math.abs(x) / (radius * 2), (y - mid) / height]),
        segments: 48,
      },
    },
  };
}

export function sketchSolid(
  plane: SketchPlane,
  shape: SketchShape,
  look: { id: string; name: string; color: string },
): SketchSolid | null {
  const profile = sketchProfile(shape.sketch);
  const body = profile && (shape.mode === 'revolve' ? revolveBody(profile) : extrudeBody(profile, shape.depth));

  if (!body) return null;

  const position = planePoint(plane, body.anchor, body.lift);
  const dims = { width: tidy(body.dims.width), height: tidy(body.dims.height), depth: tidy(body.dims.depth) };

  return {
    position: tidyVec(position),
    rotation: rotationOf(partFrame(plane.u, plane.n, plane.v)),
    dimensions: dims,
    role: shape.mode === 'extrude' && shape.depth < 0 ? 'cutout' : 'solid',
    node: {
      id: look.id,
      name: look.name,
      role: 'solid',
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      dimensions: dims,
      color: look.color,
      ...body.node,
    },
    record: { sketch: shape.sketch, mode: shape.mode, depth: shape.depth, anchor: body.anchor },
  };
}

export function partPlane(part: Pick<ScenePart, 'position' | 'rotation' | 'dimensions' | 'sketch'>): SketchPlane {
  const record = part.sketch!;
  const q = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(...(part.rotation.map((d) => THREE.MathUtils.degToRad(d)) as Vec3), 'XYZ'),
  );
  const u = new THREE.Vector3(1, 0, 0).applyQuaternion(q);
  const n = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
  const v = new THREE.Vector3(0, 0, -1).applyQuaternion(q);
  const half = part.dimensions.height / 2;
  const lift = record.mode === 'extrude' && record.depth < 0 ? -half : half;
  const origin = v3(part.position)
    .addScaledVector(n, -lift)
    .addScaledVector(u, -record.anchor[0])
    .addScaledVector(v, -record.anchor[1]);

  return { origin: tidyVec(origin), u: tidyVec(u), v: tidyVec(v), n: tidyVec(n) };
}

export function partFromSolid<T extends ScenePart>(part: T, solid: SketchSolid): T {
  return {
    ...part,
    position: solid.position,
    rotation: solid.rotation,
    dimensions: { ...part.dimensions, ...solid.dimensions },
    role: solid.role,
    customNodes: [{ ...solid.node, id: part.customNodes?.[0]?.id ?? solid.node.id, color: part.color }],
    sketch: solid.record,
  };
}
