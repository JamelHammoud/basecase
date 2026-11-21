import { jointBounds } from './jointBounds';
import { COMPONENT_BY_ID } from '../data/components';
import SHIPPED_MESHES from '../data/component-meshes.json';
import type { GalleryBundle } from '../gallery/galleryBundle';
import { asString, vector, refuse } from '../cases/validate';

const KINDS = new Set([
  'box',
  'cylinder',
  'tube',
  'sphere',
  'wedge',
  'torus',
  'cube',
  'cone',
  'pyramid',
  'hex_prism',
  'capsule',
  'dome',
  'hardware',
  'component',
  'mesh',
]);
const BLOCKED = new Set([
  'customModel',
  'customNodes',
  'boolean',
  'sculptMesh',
  'cad',
  'code',
  'script',
  'visual',
  'imageUrl',
]);
const MAX_COORDINATE = 500000;

export function boundedData(value: unknown, depth = 0): void {
  if (depth > 24) refuse('Classroom file', 'is nested too deeply.');

  if (typeof value === 'number' && !Number.isFinite(value)) refuse('Classroom file', 'needs finite numbers.');

  if (!value || typeof value !== 'object') return;

  for (const [key, child] of Object.entries(value)) {
    if (['__proto__', 'prototype', 'constructor'].includes(key))
      refuse('Classroom file', 'contains an unsupported field.');

    boundedData(child, depth + 1);
  }
}

function safePart(part: GalleryBundle['robot']['parts'][number]): void {
  if (!KINDS.has(part.kind) || Object.keys(part).some((key) => BLOCKED.has(key)))
    refuse('Robot', 'needs supported shapes or a baked mesh.');

  if (part.kind === 'mesh' && !part.mesh) refuse('Robot mesh', 'is missing.');

  componentBounds(part);

  if (
    typeof part.name !== 'string' ||
    !part.name ||
    part.name.length > 80 ||
    !['solid', 'cutout', 'reference'].includes(part.role) ||
    typeof part.visible !== 'boolean'
  )
    refuse('Robot part', 'needs its name, role and visibility.');

  if (
    Object.values(part.dimensions).some((n) => typeof n !== 'number' || n <= 0 || n > MAX_COORDINATE) ||
    part.position.some((n) => Math.abs(n) > MAX_COORDINATE)
  )
    refuse('Robot dimensions', 'must fit within 500 m.');

  optionalPartData(part);
  meshBounds(part);
}

function optionalPartData(part: GalleryBundle['robot']['parts'][number]) {
  if (part.massG !== undefined && (!Number.isFinite(part.massG) || part.massG <= 0 || part.massG > 1000000000))
    refuse('Robot mass', 'must be positive and at most 1,000 tonnes.');

  if (part.com !== undefined) vector(3)(part.com, 'Robot center of mass');

  if (part.note !== undefined) asString(part.note, 'Part note');

  if (part.color !== undefined) asString(part.color, 'Part color');

  if (part.mesh?.visual) refuse('Robot mesh', 'needs embedded geometry without local visual references.');
}

function componentBounds(part: GalleryBundle['robot']['parts'][number]) {
  if (
    part.kind === 'component' &&
    (!part.componentId || !COMPONENT_BY_ID[part.componentId] || !Object.hasOwn(SHIPPED_MESHES, part.componentId))
  )
    refuse('Robot component', 'needs a portable mesh.');
}

function meshBounds(part: GalleryBundle['robot']['parts'][number]) {
  if (
    part.mesh &&
    (part.mesh.indices.length > 300000 ||
      part.mesh.positions.length > 900000 ||
      part.mesh.positions.some((n) => Math.abs(n) > MAX_COORDINATE))
  )
    refuse('Robot mesh', 'is too large.');
}

export function boundedRobot(bundle: GalleryBundle): GalleryBundle {
  const { parts, joints } = bundle.robot;
  const ids = new Set(parts.map((p) => p.id));

  if ([...ids, ...joints.map((j) => j.id)].some((id) => ['__proto__', 'constructor', 'prototype'].includes(id)))
    refuse('Robot', 'needs distinct plain ids.');

  if (
    !parts.length ||
    parts.length > 256 ||
    joints.length > 64 ||
    ids.size !== parts.length ||
    new Set(joints.map((j) => j.id)).size !== joints.length
  )
    refuse('Robot', 'needs distinct ids, up to 256 parts and 64 joints.');

  parts.forEach(safePart);

  jointBounds(joints, ids);

  const triangles = parts.reduce((n, p) => n + (p.mesh?.indices.length ?? 0) / 3, 0);

  if (triangles > 100000) refuse('Robot mesh', 'is too large.');

  return bundle;
}
