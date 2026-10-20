import * as THREE from 'three';
import { MeshBVH } from 'three-mesh-bvh';
import { worldGeometry } from '../../three/interference';
import { boxContacts } from '../guideScene';
import type { Box, GuideScene, V3 } from '../guideTypes';
import type { GuideRenderer } from './guideRenderer';

const CANDIDATE_GAP_MM = 1;
const CONTACT_MM = 0.75;
const PAIRS_PER_SLICE = 24;

type Solid = { geometry: THREE.BufferGeometry; bvh: MeshBVH; triangles: number };

function overlapBox(a: Box, b: Box): THREE.Box3 {
  const min = new THREE.Vector3(...a.min).max(new THREE.Vector3(...b.min)).subScalar(CONTACT_MM);
  const max = new THREE.Vector3(...a.max).min(new THREE.Vector3(...b.max)).addScalar(CONTACT_MM);

  return new THREE.Box3(min, max);
}

const toBox = (b: THREE.Box3): Box => ({ min: b.min.toArray() as V3, max: b.max.toArray() as V3 });

const yieldToMain = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

function solidOf(cache: Map<string, Solid | null>, renderer: GuideRenderer, id: string): Solid | null {
  if (cache.has(id)) return cache.get(id)!;

  const group = renderer.group(id);
  const geometry = group ? worldGeometry(group) : null;
  const solid = geometry
    ? { geometry, bvh: new MeshBVH(geometry), triangles: geometry.attributes.position.count / 3 }
    : null;

  if (solid) solid.geometry.boundsTree = solid.bvh;

  cache.set(id, solid);

  return solid;
}

const SAMPLES = 400;
const probe = new THREE.Vector3();
const hit = { point: new THREE.Vector3(), distance: 0, faceIndex: 0 };

function touches(a: Solid, b: Solid, box: THREE.Box3): boolean {
  const [big, small] = a.triangles >= b.triangles ? [a, b] : [b, a];
  const positions = small.geometry.attributes.position;
  const step = Math.max(1, Math.floor(positions.count / SAMPLES));

  for (let i = 0; i < positions.count; i += step) {
    probe.fromBufferAttribute(positions, i);

    if (box.containsPoint(probe) && big.bvh.closestPointToPoint(probe, hit, 0, CONTACT_MM)) return true;
  }

  return false;
}

export async function measureGuideScene(
  renderer: GuideRenderer,
  isCancelled: () => boolean,
): Promise<Pick<GuideScene, 'boxes' | 'contacts' | 'axes'>> {
  const ids = renderer.ids();

  renderer.showAll();

  const boxes: Record<string, Box> = {};
  const axes: Record<string, V3> = {};

  for (const id of ids) {
    const group = renderer.group(id)!;

    boxes[id] = toBox(new THREE.Box3().setFromObject(group));
    axes[id] = new THREE.Vector3(0, 1, 0)
      .applyQuaternion(group.getWorldQuaternion(new THREE.Quaternion()))
      .toArray() as V3;
  }

  const candidates = boxContacts(boxes, CANDIDATE_GAP_MM);
  const cache = new Map<string, Solid | null>();
  const contacts: Record<string, string[]> = Object.fromEntries(ids.map((id) => [id, []]));
  let done = 0;

  for (const a of ids) {
    for (const b of candidates[a].filter((x) => x > a)) {
      if (isCancelled()) return { boxes, contacts, axes };

      const sa = solidOf(cache, renderer, a);
      const sb = solidOf(cache, renderer, b);

      if (sa && sb && touches(sa, sb, overlapBox(boxes[a], boxes[b]))) {
        contacts[a].push(b);
        contacts[b].push(a);
      }

      if (++done % PAIRS_PER_SLICE === 0) await yieldToMain();
    }
  }

  for (const solid of cache.values()) solid?.geometry.dispose();

  return { boxes, contacts, axes };
}
