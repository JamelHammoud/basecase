import * as THREE from 'three';
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

export interface WorldEmit {
  lines: string[];
  assets: string[];
  bodies: SimBody[];
}

function geomAttrs(item: WorldItem): string {
  const contact = CONTACT[item.behavior];
  const friction = item.physics?.friction ? ` priority="1" friction="${f(item.physics.friction)} 0.02 0.002"` : '';

  if (item.behavior !== 'dynamic') return `${contact}${friction}`;

  return `${contact} mass="${f(Math.max(item.massG ?? DEFAULT_DYNAMIC_GRAMS, 0.1) / 1000)}"${friction}`;
}

const boxSize = ({ dimensions: d }: WorldItem) => vec([d.width / 2000, d.depth / 2000, d.height / 2000]);

function primitiveShape(item: WorldItem): string | null {
  const d = item.dimensions;

  if (partEdges(item)) return null;

  if (item.kind === 'sphere') return `type="sphere" size="${f(d.width / 2000)}"`;

  if (item.kind === 'cylinder') return `type="cylinder" size="${f(d.width / 2000)} ${f(d.height / 2000)}"`;

  return item.kind === 'box' || item.kind === 'cube' ? `type="box" size="${boxSize(item)}"` : null;
}

function hullShape(item: WorldItem, input: MjcfInput, out: WorldEmit, assetOffset: number): string | null {
  const tris = input.worldTriangles?.(item.id);
  const verts = tris && tris.length >= 9 ? cachedHull(item, tris, item.position) : null;

  if (!verts) return null;

  const mesh = `wm${assetOffset + out.assets.length}_${safeId(item.id)}`;

  out.assets.push(`    <mesh name="${mesh}" vertex="${vec(verts)}" maxhullvert="96" inertia="convex"/>`);

  return `type="mesh" mesh="${mesh}"`;
}

function worldGeom(item: WorldItem, input: MjcfInput, out: WorldEmit, assetOffset: number): string {
  const name = `wg_${safeId(item.id)}`;
  const hull = primitiveShape(item) ? null : hullShape(item, input, out, assetOffset);

  if (hull) return `<geom name="${esc(name)}" ${hull} ${geomAttrs(item)}/>`;

  const shape = primitiveShape(item) ?? `type="box" size="${boxSize(item)}"`;
  const turn = quatToMj(new THREE.Quaternion().setFromRotationMatrix(partMatrix(item)));

  return `<geom name="${esc(name)}" ${shape} quat="${vec(turn)}" ${geomAttrs(item)}/>`;
}

export function emitWorld(input: MjcfInput, assetOffset: number): WorldEmit {
  const out: WorldEmit = { lines: [], assets: [], bodies: [] };

  (input.world ?? []).forEach((item, i) => {
    const name = `w${i}_${safeId(item.id)}`;
    const geom = worldGeom(item, input, out, assetOffset);

    out.bodies.push({ name, parts: [], world: [item.id], origin: item.position });
    out.lines.push(`    <body name="${esc(name)}" pos="${vec(toMj(item.position))}">`);

    if (item.behavior === 'dynamic') out.lines.push(`      <freejoint name="${esc(name)}"/>`);

    out.lines.push(`      ${geom}`, '    </body>');
  });

  return out;
}
