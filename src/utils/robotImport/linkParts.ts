import * as THREE from 'three';
import type { ScenePart } from '../../types/robotics';
import type { SoupPiece } from '../../three/geometryOps';
import { geometryWorker } from '../../three/geometryWorker';
import { primitive } from './meshes';
import type { Model, ModelLink, Visual } from './model';
import { hex, linkLabel, round, ROBOT_DATA_VERSION, type PublishedData } from './published';
import type { Source } from './sources';

export type MeshFiles = Map<string, THREE.BufferGeometry | null>;

export interface LinkGeometry {
  soup: Float32Array;
  box: THREE.Box3;
  color: THREE.Color;
}

export interface PartsSpec {
  name: string;
  groupId: string;
  source: Source;
  rotate?: Array<[string, number]>;
  maxTriangles?: number;
}

export interface BuiltParts {
  parts: ScenePart[];
  triangles: number;
  shift: THREE.Vector3;
  partOfLink: Map<string, string>;
  centerOfLink: Map<string, THREE.Vector3>;
}

function visualGeometry(v: Visual, files: MeshFiles): THREE.BufferGeometry | null {
  if (v.geometry.type !== 'mesh') return primitive(v.geometry);

  const src = files.get(v.geometry.file);

  if (!src) return null;

  return src.clone();
}

const MILLIMETERS = new THREE.Matrix4().makeScale(1000, 1000, 1000);

function visualMatrix(v: Visual, l: ModelLink, frame: THREE.Matrix4): THREE.Matrix4 {
  const matrix = MILLIMETERS.clone().multiply(frame).multiply(l.world).multiply(v.origin);

  return v.geometry.type === 'mesh' ? matrix.scale(v.geometry.scale) : matrix;
}

async function linkGeometry(l: ModelLink, files: MeshFiles, frame: THREE.Matrix4) {
  const pieces: SoupPiece[] = [];
  const colors: THREE.Color[] = [];

  for (const v of l.visuals) {
    const g = visualGeometry(v, files);

    if (!g) continue;

    pieces.push({
      positions: (g.getAttribute('position').array as Float32Array).slice(),
      matrix: visualMatrix(v, l, frame).toArray(),
    });

    if (v.color) colors.push(v.color);
  }

  if (!pieces.length) return null;

  const { soup, min, max } = await geometryWorker.call(
    'linkSoup',
    pieces,
    pieces.map((p) => p.positions.buffer),
  );

  return { soup, box: new THREE.Box3(new THREE.Vector3(...min), new THREE.Vector3(...max)), colors };
}

export async function linkGeometries(
  model: Model,
  files: MeshFiles,
  frame: THREE.Matrix4,
  color: string | undefined,
): Promise<Map<string, LinkGeometry>> {
  const built = await Promise.all(
    [...model.links].map(async ([link, l]) => [link, await linkGeometry(l, files, frame)] as const),
  );
  const linkGeo = new Map<string, LinkGeometry>();

  for (const [link, geometry] of built) {
    if (!geometry) continue;

    linkGeo.set(link, {
      soup: geometry.soup,
      box: geometry.box,
      color: color ? new THREE.Color(color) : (geometry.colors[0] ?? new THREE.Color('#b3b3b3')),
    });
  }

  return linkGeo;
}

interface PartBuild {
  spec: PartsSpec;
  shift: THREE.Vector3;
  budget: number;
  total: number;
}

async function linkPart(b: PartBuild, link: string, { soup, color }: LinkGeometry) {
  const { name, groupId, source, rotate } = b.spec;
  const tris = soup.length / 9;
  const target = b.total > b.budget ? Math.max(1500, Math.round((b.budget * tris) / b.total)) : tris;
  const mesh = await geometryWorker.call('linkMesh', { soup, target }, [soup.buffer]);
  const center = new THREE.Vector3(...mesh.center);
  const size = new THREE.Vector3(...mesh.size);
  const id = `${groupId}-${link.replace(/[^a-zA-Z0-9_-]+/g, '_')}`;
  const baseSize: [number, number, number] = [Math.max(size.x, 0.01), Math.max(size.y, 0.01), Math.max(size.z, 0.01)];
  const { shift } = b;
  const part: ScenePart = {
    id,
    name: linkLabel(link),
    kind: 'mesh',
    category: 'structure',
    role: 'solid',
    position: [round(center.x + shift.x), round(center.y + shift.y), round(center.z + shift.z)],
    rotation: [0, 0, 0],
    dimensions: { width: round(baseSize[0]), height: round(baseSize[1]), depth: round(baseSize[2]) },
    color: hex(color),
    note: '',
    mechanicalTag: `${name} · ${link}`,
    visible: true,
    locked: false,
    mesh: { positions: mesh.positions, indices: mesh.indices, baseSize, source: `${name} · ${link}` },
    group: { id: groupId, name },
    robotLink: {
      robot: groupId,
      link,
      url: source.kind === 'url' ? source.url : undefined,
      rotate,
      version: ROBOT_DATA_VERSION,
    },
  };

  return { part, center, triangles: mesh.indices.length / 3 };
}

export async function buildLinkParts(linkGeo: Map<string, LinkGeometry>, spec: PartsSpec): Promise<BuiltParts> {
  const budget = spec.maxTriangles ?? 220_000;
  const total = [...linkGeo.values()].reduce((s, { soup }) => s + soup.length / 9, 0);
  const box = new THREE.Box3();

  linkGeo.forEach((lg) => box.union(lg.box));

  const shift = new THREE.Vector3(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2);
  const out: BuiltParts = { parts: [], triangles: 0, shift, partOfLink: new Map(), centerOfLink: new Map() };

  const built = await Promise.all(
    [...linkGeo].map(async ([link, lg]) => ({ link, ...(await linkPart({ spec, shift, budget, total }, link, lg)) })),
  );

  for (const { link, part, center, triangles } of built) {
    out.triangles += triangles;
    out.partOfLink.set(link, part.id);
    out.centerOfLink.set(link, center.clone());
    out.parts.push(part);
  }

  return out;
}

export function applyPublishedMass(built: BuiltParts, data: PublishedData) {
  for (const p of built.parts) {
    const link = p.robotLink!.link;
    const d = data.links.get(link);

    if (!d) continue;

    p.massG = Math.round(d.massKg * 10000) / 10;

    const c = d.com.clone().sub(built.centerOfLink.get(link)!);

    p.com = [round(c.x), round(c.y), round(c.z)];
  }
}
