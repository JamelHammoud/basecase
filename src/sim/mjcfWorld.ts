import * as THREE from 'three';
import { validateWorldFixtures } from '../cases/fixtureValidation';
import { partMatrix } from '../utils/kinematics';
import { partEdges } from '../utils/partEdges';
import { quatToMj, toMj } from './mjcfFrames';
import { cachedHull } from './mjcfHull';
import { esc, f, safeId, vec } from './mjcfText';
import type { MjcfInput, SimBody, WorldBehavior, WorldItem } from './mjcfTypes';

const CONTACT: Record<WorldBehavior, string> = {
  static: 'contype="0" conaffinity="1"',
  dynamic: 'contype="1" conaffinity="1"',
  marker: 'contype="0" conaffinity="0"',
};

const DEFAULT_DYNAMIC_GRAMS = 100;

export function worldFloor(input: MjcfInput): string {
  if (input.world?.some((item) => item.behavior === 'static' && item.convexVertices)) return '';

  return '    <geom name="floor" type="plane" size="0 0 0.05" contype="0" conaffinity="1"/>';
}

export interface WorldEmit {
  lines: string[];
  assets: string[];
  bodies: SimBody[];
}

function geomAttrs(item: WorldItem, share = 1): string {
  const contact = CONTACT[item.behavior];
  const friction =
    item.physics?.friction !== undefined ? ` priority="1" friction="${f(item.physics.friction)} 0.02 0.002"` : '';

  if (item.behavior !== 'dynamic') return `${contact}${friction}`;

  return `${contact} mass="${(Math.max(item.massG ?? DEFAULT_DYNAMIC_GRAMS, 0.1) * share) / 1000}"${friction}`;
}

const boxSize = ({ dimensions: d }: WorldItem) => vec([d.width / 2000, d.depth / 2000, d.height / 2000]);

function primitiveShape(item: WorldItem): string | null {
  const d = item.dimensions;

  if (item.convexVertices || partEdges(item) || item.sheetTransform) return null;

  if (item.kind === 'sphere') return `type="sphere" size="${f(d.width / 2000)}"`;

  if (item.kind === 'cylinder') return `type="cylinder" size="${f(d.width / 2000)} ${f(d.height / 2000)}"`;

  return item.kind === 'box' || item.kind === 'cube' ? `type="box" size="${boxSize(item)}"` : null;
}

function suppliedHull(vertices: Float32Array): number[] {
  if (vertices.length < 12 || vertices.length > 96 * 3 || vertices.length % 3 || !vertices.every(Number.isFinite))
    throw new Error('World collision hull needs 4 to 96 finite vertices.');

  const result: number[] = [];

  for (let i = 0; i < vertices.length; i += 3) result.push(...toMj([vertices[i], vertices[i + 1], vertices[i + 2]]));

  return result;
}

function worldHull(item: WorldItem, input: MjcfInput): number[] | null {
  if (item.convexVertices) return suppliedHull(item.convexVertices);

  const tris = input.worldTriangles?.(item.id);

  return tris && tris.length >= 9 ? cachedHull(item, tris, item.position) : null;
}

function hullShape(item: WorldItem, input: MjcfInput, out: WorldEmit, assetOffset: number): string | null {
  const verts = worldHull(item, input);

  if (!verts) return null;

  const mesh = `wm${assetOffset + out.assets.length}_${safeId(item.id)}`;

  out.assets.push(`    <mesh name="${mesh}" vertex="${vec(verts)}" maxhullvert="96" inertia="convex"/>`);

  return `type="mesh" mesh="${mesh}"`;
}

function worldGeom(item: WorldItem, input: MjcfInput, out: WorldEmit, assetOffset: number): string {
  const name = `wg_${safeId(item.id)}`;

  if (item.collisionHulls)
    return item.collisionHulls
      .map((vertices, i) => {
        const shape = hullShape({ ...item, convexVertices: vertices }, input, out, assetOffset);

        return `<geom name="${esc(name)}_${i}" ${shape} ${geomAttrs(item, 1 / item.collisionHulls!.length)}/>`;
      })
      .join('\n');

  const hull = primitiveShape(item) ? null : hullShape(item, input, out, assetOffset);

  if (hull) return `<geom name="${esc(name)}" ${hull} ${geomAttrs(item)}/>`;

  const shape = primitiveShape(item) ?? `type="box" size="${boxSize(item)}"`;
  const turn = quatToMj(new THREE.Quaternion().setFromRotationMatrix(partMatrix(item)));

  return `<geom name="${esc(name)}" ${shape} quat="${vec(turn)}" ${geomAttrs(item)}/>`;
}

function jointXml(item: WorldItem): string | null {
  const joint = item.joint;

  if (!joint || joint.locked) return null;

  const unit = joint.type === 'revolute' ? Math.PI / 180 : 0.001;
  const offset = joint.origin.map((n, i) => n - item.position[i]) as [number, number, number];
  const axis = [joint.axis[0], -joint.axis[2], joint.axis[1]];
  const range = joint.range.map((n) => n * unit);
  const spring =
    joint.stiffness === undefined && joint.springref === undefined
      ? ''
      : ` stiffness="${joint.stiffness ?? 0}" springref="${(joint.springref ?? 0) * unit}"`;

  return `<joint name="wj_${safeId(item.id)}" type="${joint.type === 'revolute' ? 'hinge' : 'slide'}" pos="${vec(toMj(offset))}" axis="${vec(axis)}" limited="true" solreflimit="0.004 1" solreffriction="0.004 1" solimpfriction="0.99 0.999 0.0001" range="${range.join(' ')}" damping="${f(joint.damping)}" frictionloss="${f(joint.frictionloss)}"${spring}/>`;
}

export function emitWorld(input: MjcfInput, assetOffset: number): WorldEmit {
  const out: WorldEmit = { lines: [], assets: [], bodies: [] };
  const items = input.world ?? [];

  validateWorldFixtures(items);

  const names = new Map(items.map((item, i) => [item.id, `w${i}_${safeId(item.id)}`]));
  const children = new Map<string | undefined, WorldItem[]>();

  for (const item of items) {
    const siblings = children.get(item.parent) ?? [];

    siblings.push(item);
    children.set(item.parent, siblings);
  }

  const emit = (item: WorldItem, parent?: WorldItem) => {
    const name = names.get(item.id)!;
    const geom = worldGeom(item, input, out, assetOffset);
    const mocap = item.movable && item.behavior !== 'dynamic';
    const moves = item.movable ? { moves: { kind: mocap ? 'mocap' : 'free', rotation: item.rotation } as const } : {};
    const position = item.position.map((n, i) => n - (parent?.position[i] ?? 0)) as [number, number, number];
    const joint = jointXml(item);

    out.bodies.push({
      name,
      parts: [],
      world: [item.id],
      origin: item.position,
      ...(parent ? { parent: names.get(parent.id) } : {}),
      ...moves,
    });
    out.lines.push(`    <body name="${esc(name)}" pos="${vec(toMj(position))}"${mocap ? ' mocap="true"' : ''}>`);

    if (joint) out.lines.push(`      ${joint}`);

    if (item.behavior === 'dynamic' && !item.parent && !item.joint)
      out.lines.push(`      <freejoint name="${esc(name)}"/>`);

    out.lines.push(`      ${geom}`);

    for (const child of children.get(item.id) ?? []) emit(child, item);

    out.lines.push('    </body>');
  };

  for (const item of children.get(undefined) ?? []) emit(item);

  return out;
}
