import * as THREE from 'three';
import type { ScenePart } from '../types/robotics';
import type { V3 } from './agentFrame';
import { partSpans, type Span } from './axisHits';

export type PartMesh = (id: string) => Float32Array | null;

const RING_RAYS = 8;
const RING_MARGIN_MM = 0.6;
const CONTACT_MM = 0.05;
const COUNTERBORE_GAIN_MM = 0.2;

export interface AxisRay {
  origin: V3;
  dir: V3;
}

export interface FoundSpan {
  span: Span;
  throughHole: boolean;
  exact: boolean;
}

function ringOffsets(dir: V3, radius: number): THREE.Vector3[] {
  const d = new THREE.Vector3(...dir);
  const side = new THREE.Vector3(Math.abs(d.x) < 0.9 ? 1 : 0, Math.abs(d.x) < 0.9 ? 0 : 1, 0).cross(d).normalize();
  const other = d.clone().cross(side);

  return Array.from({ length: RING_RAYS }, (_, i) => {
    const a = (i / RING_RAYS) * Math.PI * 2;

    return side
      .clone()
      .multiplyScalar(Math.cos(a) * radius)
      .addScaledVector(other, Math.sin(a) * radius);
  });
}

const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];

function firstAfter(spans: Span[], after: number): Span | undefined {
  return spans.find(([enter]) => enter >= after - CONTACT_MM);
}

function ringSpan(part: ScenePart, ray: AxisRay, q: { after: number; radius: number; mesh: PartMesh }): Span | null {
  const triangles = q.mesh(part.id);
  const hits = ringOffsets(ray.dir, q.radius)
    .map((o) => {
      const origin = new THREE.Vector3(...ray.origin).add(o).toArray() as V3;

      return firstAfter(partSpans(part, origin, ray.dir, triangles), q.after);
    })
    .filter((s): s is Span => !!s);

  if (hits.length * 2 < RING_RAYS) return null;

  return [median(hits.map((s) => s[0])), median(hits.map((s) => s[1]))];
}

const isExactShape = (part: ScenePart, mesh: PartMesh) => (part.kind === 'cad_part' && !!part.cad) || !!mesh(part.id);

export function layerSpan(
  part: ScenePart,
  ray: AxisRay,
  q: { after: number; holeRadius: number; mesh: PartMesh },
): FoundSpan | null {
  const exact = isExactShape(part, q.mesh);
  const centre = firstAfter(partSpans(part, ray.origin, ray.dir, q.mesh(part.id)), q.after);

  if (!exact) return centre ? { span: centre, throughHole: false, exact } : null;

  const ring = ringSpan(part, ray, { after: q.after, radius: q.holeRadius + RING_MARGIN_MM, mesh: q.mesh });

  if (ring && (!centre || ring[0] < centre[0] - COUNTERBORE_GAIN_MM)) return { span: ring, throughHole: true, exact };

  return centre ? { span: centre, throughHole: false, exact } : null;
}
