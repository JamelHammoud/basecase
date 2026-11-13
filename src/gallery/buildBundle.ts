import type { Case } from '../cases/schema';
import SHIPPED_MESHES from '../data/component-meshes.json';
import type { RobotJoint, ScenePart } from '../types/robotics';
import { GALLERY_FORMAT_VERSION, type GalleryBundle } from './galleryBundle';
import type { GalleryTrained } from './galleryTrained';

export interface BundleSource {
  slug: string;
  title: string;
  robotName: string;
  parts: ScenePart[];
  joints: RobotJoint[];
  kase: Case | null;
  triangles?: (id: string) => Float32Array | null;
  trained?: GalleryTrained | null;
}

const MESH_STEP = 100;

const shipsMesh = (id: string) => Object.hasOwn(SHIPPED_MESHES, id);

const needsInlineMesh = (part: ScenePart) =>
  part.kind === 'component' && !!part.componentId && !shipsMesh(part.componentId);

const rounded = (v: number) => Math.round(v * MESH_STEP) / MESH_STEP;

export function inlineMesh(triangles: Float32Array, size: ScenePart['dimensions']): NonNullable<ScenePart['mesh']> {
  const seen = new Map<string, number>();
  const positions: number[] = [];
  const indices: number[] = [];

  for (let i = 0; i + 2 < triangles.length; i += 3) {
    const vertex = [rounded(triangles[i]), rounded(triangles[i + 1]), rounded(triangles[i + 2])];
    const key = vertex.join(',');
    let at = seen.get(key);

    if (at === undefined) {
      at = positions.length / 3;
      seen.set(key, at);
      positions.push(...vertex);
    }

    indices.push(at);
  }

  return { positions, indices, baseSize: [size.width, size.height, size.depth] };
}

function withoutLocalVisual(part: ScenePart): ScenePart {
  if (!part.mesh?.visual) return part;

  const mesh = { ...part.mesh };

  delete mesh.visual;

  return { ...part, mesh };
}

function portablePart(part: ScenePart, triangles: BundleSource['triangles']): ScenePart {
  const lean = withoutLocalVisual(part);
  const shape = needsInlineMesh(lean) ? triangles?.(lean.id) : null;

  if (!shape?.length) return lean;

  const inlined: ScenePart = { ...lean, kind: 'mesh', mesh: inlineMesh(shape, lean.dimensions) };

  delete inlined.componentId;
  delete inlined.componentVariant;

  return inlined;
}

export function requireCase(kase: Case | null): Case {
  if (!kase) throw new Error('Open a Case first.');

  return kase;
}

export function galleryBundleOf(source: BundleSource): GalleryBundle {
  const { trained } = source;
  const kase = requireCase(source.kase);

  return {
    formatVersion: GALLERY_FORMAT_VERSION,
    slug: source.slug,
    title: source.title,
    robot: {
      name: source.robotName,
      parts: source.parts.map((p) => portablePart(p, source.triangles)),
      joints: source.joints,
    },
    case: kase,
    ...(trained ? { trained } : {}),
  };
}
