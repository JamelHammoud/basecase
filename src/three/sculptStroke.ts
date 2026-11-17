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
  blend: number;
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
    const pushDir = n.lerp(stroke.normal, 0.5).normalize();

    v.addScaledVector(pushDir, amp * w);
  },
  carve: ({ v, n, stroke, amp, w }) => {
    const carveDir = n.lerp(stroke.normal, 0.5).normalize();

    v.addScaledVector(carveDir, -amp * w);
  },
  flatten: ({ v, n, stroke, w, blend }) => {
    const toVert = n.copy(v).sub(stroke.center);
    const signedDist = toVert.dot(stroke.normal);

    v.addScaledVector(stroke.normal, -signedDist * w * blend);
  },
  smooth: ({ v, avgPos, w, blend }) => {
    v.lerp(avgPos, w * blend);
  },
  pinch: ({ v, n, stroke, amp, w, blend }) => {
    const toCenter = n.copy(stroke.center).sub(v);

    v.addScaledVector(toCenter, w * blend);
    v.addScaledVector(stroke.normal, amp * 0.25 * w);
  },
  grab: ({ v, stroke, w, blend }) => {
    v.addScaledVector(stroke.delta, w * blend);
  },
};

const BLEND_LIMITS: Partial<Record<SculptBrushKind, [number, number]>> = {
  flatten: [1, 0.65],
  smooth: [0.75, 0.45],
  pinch: [0.5, 0.3],
  grab: [1, 1.1],
};

function strengthBlend(kind: SculptBrushKind, strength: number): number {
  const limits = BLEND_LIMITS[kind];

  return limits ? Math.min(limits[0], strength * limits[1]) : 0;
}

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

function applyDirectStroke(
  geo: THREE.BufferGeometry,
  step: BrushStep,
  brush: { kind: SculptBrushKind; radius: number },
) {
  const posAttr = geo.getAttribute('position') as THREE.BufferAttribute;
  const normAttr = brush.kind === 'inflate' || brush.kind === 'carve' ? geo.getAttribute('normal') : undefined;
  const radiusSq = brush.radius * brush.radius;
  const move = BRUSHES[brush.kind];

  for (let i = 0; i < posAttr.count; i++) {
    step.v.fromBufferAttribute(posAttr, i);

    const distSq = step.v.distanceToSquared(step.stroke.center);

    if (distSq > radiusSq) continue;

    if (normAttr) step.n.fromBufferAttribute(normAttr, i);

    step.w = 0.5 * (1 + Math.cos((Math.PI * Math.sqrt(distSq)) / brush.radius));
    move(step);
    posAttr.setXYZ(i, step.v.x, step.v.y, step.v.z);
  }
}

function applyStroke(
  geo: THREE.BufferGeometry,
  stroke: Stroke,
  brush: { kind: SculptBrushKind; radius: number; strength: number },
) {
  const posAttr = geo.getAttribute('position') as THREE.BufferAttribute;
  const { radius, strength } = brush;
  const radiusSq = radius * radius;
  const v = new THREE.Vector3();
  const n = new THREE.Vector3();
  const avgPos = new THREE.Vector3();
  const step: BrushStep = {
    v,
    n,
    stroke,
    w: 0,
    amp: strength * radius * 0.14,
    avgPos,
    blend: strengthBlend(brush.kind, strength),
  };

  if (brush.kind !== 'smooth') {
    applyDirectStroke(geo, step, brush);

    return;
  }

  const affectedIndices: number[] = [];
  const falloffs: number[] = [];

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

  const move = BRUSHES[brush.kind];

  for (let k = 0; k < affectedIndices.length; k++) {
    const idx = affectedIndices[k];

    v.fromBufferAttribute(posAttr, idx);
    step.w = falloffs[k];
    move(step);
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
