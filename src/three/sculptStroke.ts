import * as THREE from 'three';
import type { SculptBrushKind, SculptSettings } from '../types/robotics';

interface Stroke {
  center: THREE.Vector3;
  normal: THREE.Vector3;
  delta: THREE.Vector3;
}

interface BrushStep {
  v: THREE.Vector3;
  n: THREE.Vector3;
  stroke: Stroke;
  w: number;
  amp: number;
  avgPos: THREE.Vector3;
  strength: number;
}

export interface SculptStrokeInput {
  geo: THREE.BufferGeometry;
  localHitPoint: THREE.Vector3;
  localHitNormal: THREE.Vector3;
  dragDeltaLocal: THREE.Vector3;
  settings: SculptSettings;
  invertBrush?: boolean;
}

const INVERTED_BRUSH: Partial<Record<SculptBrushKind, SculptBrushKind>> = { inflate: 'carve', carve: 'inflate' };

const BRUSHES: Record<SculptBrushKind, (step: BrushStep) => void> = {
  inflate: ({ v, n, stroke, amp, w }) => {
    const pushDir = n.clone().lerp(stroke.normal, 0.5).normalize();

    v.addScaledVector(pushDir, amp * w);
  },
  carve: ({ v, n, stroke, amp, w }) => {
    const carveDir = n.clone().lerp(stroke.normal, 0.5).normalize();

    v.addScaledVector(carveDir, -amp * w);
  },
  flatten: ({ v, stroke, w, strength }) => {
    const toVert = v.clone().sub(stroke.center);
    const signedDist = toVert.dot(stroke.normal);

    v.addScaledVector(stroke.normal, -signedDist * w * Math.min(1, strength * 0.65));
  },
  smooth: ({ v, avgPos, w, strength }) => {
    v.lerp(avgPos, w * Math.min(0.75, strength * 0.45));
  },
  pinch: ({ v, stroke, amp, w, strength }) => {
    const toCenter = stroke.center.clone().sub(v);

    v.addScaledVector(toCenter, w * Math.min(0.5, strength * 0.3));
    v.addScaledVector(stroke.normal, amp * 0.25 * w);
  },
  grab: ({ v, stroke, w, strength }) => {
    v.addScaledVector(stroke.delta, w * Math.min(1, strength * 1.1));
  },
};

const flipX = (v: THREE.Vector3) => new THREE.Vector3(-v.x, v.y, v.z);
const flipZ = (v: THREE.Vector3) => new THREE.Vector3(v.x, v.y, -v.z);

function strokesFor({ localHitPoint, localHitNormal, dragDeltaLocal, settings }: SculptStrokeInput): Stroke[] {
  const strokes: Stroke[] = [
    {
      center: localHitPoint.clone(),
      normal: localHitNormal.clone().normalize(),
      delta: dragDeltaLocal.clone(),
    },
  ];
  const mirrors: Array<[boolean, (v: THREE.Vector3) => THREE.Vector3]> = [
    [settings.symmetryX && Math.abs(localHitPoint.x) > 0.5, flipX],
    [settings.symmetryZ && Math.abs(localHitPoint.z) > 0.5, flipZ],
  ];

  for (const [enabled, flip] of mirrors) {
    if (!enabled) continue;

    strokes.push({
      center: flip(localHitPoint),
      normal: flip(localHitNormal).normalize(),
      delta: flip(dragDeltaLocal),
    });
  }

  return strokes;
}

function applyStroke(
  geo: THREE.BufferGeometry,
  stroke: Stroke,
  brush: { kind: SculptBrushKind; radius: number; strength: number },
) {
  const posAttr = geo.getAttribute('position') as THREE.BufferAttribute;
  const normAttr = geo.getAttribute('normal') as THREE.BufferAttribute;
  const { radius, strength } = brush;
  const radiusSq = radius * radius;
  const v = new THREE.Vector3();
  const n = new THREE.Vector3();
  const affectedIndices: number[] = [];
  const falloffs: number[] = [];
  const avgPos = new THREE.Vector3();

  for (let i = 0; i < posAttr.count; i++) {
    v.fromBufferAttribute(posAttr, i);

    const distSq = v.distanceToSquared(stroke.center);

    if (distSq > radiusSq) continue;

    const dist = Math.sqrt(distSq);

    affectedIndices.push(i);
    falloffs.push(0.5 * (1 + Math.cos((Math.PI * dist) / radius)));
    avgPos.add(v);
  }

  if (affectedIndices.length === 0) return;

  avgPos.divideScalar(affectedIndices.length);

  const amp = strength * radius * 0.14;
  const move = BRUSHES[brush.kind];

  for (let k = 0; k < affectedIndices.length; k++) {
    const idx = affectedIndices[k];

    v.fromBufferAttribute(posAttr, idx);
    n.fromBufferAttribute(normAttr, idx);
    move({ v, n, stroke, w: falloffs[k], amp, avgPos, strength });
    posAttr.setXYZ(idx, v.x, v.y, v.z);
  }
}

export function sculptStroke(input: SculptStrokeInput): void {
  const { geo, settings, invertBrush = false } = input;
  const posAttr = geo.getAttribute('position') as THREE.BufferAttribute;

  if (!geo.getAttribute('normal')) {
    geo.computeVertexNormals();
  }

  const kind = invertBrush ? (INVERTED_BRUSH[settings.brush] ?? settings.brush) : settings.brush;
  const brush = { kind, radius: Math.max(2, settings.radiusMm), strength: settings.strength };

  for (const stroke of strokesFor(input)) applyStroke(geo, stroke, brush);

  posAttr.needsUpdate = true;
  geo.computeVertexNormals();
}
