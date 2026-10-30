import * as THREE from 'three';
import type { PrinterSetup } from '../data/printers';
import { sameDirection, type PrintPose, type PrintShape, type Vec3 } from '../three/printability';
import type { PartPrint, PrintMaterial } from '../types/robotics';
import { bedSizeText, fitOnBed, type Bed } from './bed';
import { packPlates, type PackItem } from './pack';

export interface PrintCheck {
  pose: PrintPose;
  size: Vec3;
  fits: boolean;
  yaw?: number;
  fitNote?: string;
  overhangMm2: number;
  supportMm3: number;
  contactMm2: number;
  minWallMm: number;
  thinShare: number;
}

export interface PlanInput {
  id: string;
  name: string;
  material: PrintMaterial;
  shapeKey: string;
  check: PrintCheck;
  print?: PartPrint;
  grams: number;
  supportG: number;
  hours: number;
}

export interface PlanItem {
  id: string;
  copy: number;
  name: string;
  x: number;
  y: number;
  w: number;
  d: number;
  yaw: number;
  matrix: number[];
}

export interface Plate {
  number: number;
  local: number;
  material: PrintMaterial;
  items: PlanItem[];
  grams: number;
  hours: number;
  hash: string;
}

export interface PrintPlan {
  printer: { id: string; label: string; modelId: string; nozzle: number };
  bed: Bed;
  plates: Plate[];
  plateOf: Record<string, number>;
}

const score = (pose: PrintPose, fits: boolean) =>
  (fits ? 0 : 1e12) + pose.supportMm3 - pose.contactMm2 * 0.5 + pose.size[2] * 0.01;

function overridePose(shape: PrintShape, down?: Vec3) {
  return down ? shape.poses.find((p) => sameDirection(p.down, down)) : undefined;
}

function splitNote(size: Vec3, bed: Bed) {
  const sorted = [...size].sort((a, b) => b - a);
  const pieces = Math.max(2, Math.ceil(sorted[0] / (Math.max(bed.width, bed.depth, bed.height) * 0.94)));

  return `${sorted.map((v) => Math.round(v)).join(' × ')} mm is larger than the ${bed.name} plate (${bedSizeText(bed)}). Split it into ${pieces} pieces along its longest side, joined with dowels or screws.`;
}

export function choosePose(shape: PrintShape, bed: Bed, print?: PartPrint): PrintCheck {
  const forced = overridePose(shape, print?.down);
  const candidates = forced ? [forced] : shape.poses.filter((p) => !p.requested);
  const scored = candidates.map((pose) => {
    const fit = fitOnBed(pose.size[0], pose.size[1], pose.size[2], bed);

    return { pose, fit, score: score(pose, !!fit) };
  });
  const best = scored.reduce((a, b) => (b.score < a.score ? b : a));
  const { pose, fit } = best;

  return {
    pose,
    size: pose.size,
    fits: !!fit,
    yaw: fit?.yaw,
    fitNote: fit ? undefined : splitNote(pose.size, bed),
    overhangMm2: pose.overhangMm2,
    supportMm3: pose.supportMm3,
    contactMm2: pose.contactMm2,
    minWallMm: shape.minWallMm,
    thinShare: shape.thinShare,
  };
}

const MAPPING = new THREE.Matrix4().set(1, 0, 0, 0, 0, 0, -1, 0, 0, 1, 0, 0, 0, 0, 0, 1);

export function itemMatrix(
  pose: PrintPose,
  place: { x: number; y: number; w: number; d: number; yaw: number },
  bed: Bed,
) {
  const [mx, my, mz] = pose.min;
  const [sx, sz] = [pose.size[0], pose.size[1]];
  const rotate = new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion(...pose.rotation));
  const center = new THREE.Matrix4().makeTranslation(-(mx + sx / 2), -my, -(mz + sz / 2));
  const yaw = new THREE.Matrix4().makeRotationY(THREE.MathUtils.degToRad(place.yaw));
  const onPlate = new THREE.Matrix4().makeTranslation(
    bed.origin[0] + place.x + place.w / 2,
    bed.origin[1] + place.y + place.d / 2,
    0,
  );

  return onPlate
    .multiply(MAPPING)
    .multiply(yaw)
    .multiply(center)
    .multiply(rotate)
    .elements.map((v) => Math.round(v * 1e6) / 1e6);
}

function fnv(text: string): string {
  let h = 0x811c9dc5;

  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193) >>> 0;

  return h.toString(36);
}

const copiesOf = (input: PlanInput) => Math.max(1, Math.min(50, Math.round(input.print?.copies ?? 1)));

function packItems(inputs: PlanInput[]): PackItem[] {
  return inputs.flatMap((input) =>
    Array.from({ length: copiesOf(input) }, (_, copy) => {
      const [w, d] = input.check.size;
      const diagonal = input.check.yaw !== undefined && input.check.yaw % 90 !== 0;
      const at = copy === 0 ? input.print?.at : undefined;
      const fixed =
        at && input.print?.plate
          ? { plate: input.print.plate, x: at[0], y: at[1], turned: !!input.print.turned }
          : undefined;

      return {
        id: `${input.id}#${copy}`,
        w,
        d,
        diagonalYaw: diagonal ? input.check.yaw : undefined,
        fixed,
        startPlate: input.print?.plate,
      };
    }),
  );
}

interface MaterialPlan {
  material: PrintMaterial;
  inputs: PlanInput[];
}

function materialPlates(group: MaterialPlan, bed: Bed, first: number, settings: string): Plate[] {
  const byId = new Map(group.inputs.map((i) => [i.id, i]));
  const { placements, plates } = packPlates(packItems(group.inputs), bed);
  const out: Plate[] = Array.from({ length: plates }, (_, i) => ({
    number: first + i,
    local: i + 1,
    material: group.material,
    items: [],
    grams: 0,
    hours: 0,
    hash: '',
  }));

  for (const [key, place] of Object.entries(placements)) {
    const [id, copy] = [key.slice(0, key.lastIndexOf('#')), Number(key.slice(key.lastIndexOf('#') + 1))];
    const input = byId.get(id)!;
    const plate = out[place.plate - 1];

    plate.items.push({ id, copy, name: input.name, ...place, matrix: itemMatrix(input.check.pose, place, bed) });
    plate.grams += input.grams + input.supportG;
    plate.hours += input.hours;
  }

  for (const plate of out) {
    plate.items.sort((a, b) => a.id.localeCompare(b.id) || a.copy - b.copy);
    plate.hash = fnv(
      [
        settings,
        plate.material,
        ...plate.items.map((it) => `${byId.get(it.id)!.shapeKey}@${it.matrix.join(',')}`),
      ].join('|'),
    );
  }

  return out.filter((p) => p.items.length);
}

export function buildPrintPlan(inputs: PlanInput[], setup: PrinterSetup, bed: Bed, settings: string): PrintPlan {
  const placeable = inputs.filter((i) => i.check.fits && !i.print?.skip);
  const materials = [...new Set(placeable.map((i) => i.material))];
  const plates: Plate[] = [];

  for (const material of materials) {
    const group = { material, inputs: placeable.filter((i) => i.material === material) };

    plates.push(...materialPlates(group, bed, plates.length + 1, `${setup.model.id}|${setup.nozzle}|${settings}`));
  }

  plates.forEach((p, i) => (p.number = i + 1));

  const plateOf: Record<string, number> = {};

  for (const plate of plates) for (const item of plate.items) plateOf[item.id] ??= plate.number;

  return {
    printer: { id: setup.id, label: setup.label, modelId: setup.model.id, nozzle: setup.nozzle },
    bed,
    plates,
    plateOf,
  };
}
