import { buildGuidePlan } from '../../guide/guidePlan';
import { approximateScene } from '../../guide/guideScene';
import type { RobotJoint, ScenePart } from '../../types/robotics';
import { partBounds } from '../../utils/selection';

export interface MergeGuide {
  parts: ScenePart[];
  joints: RobotJoint[];
  material: string;
}

type V3 = [number, number, number];

const HEAVY: Array<keyof ScenePart> = [
  'cad',
  'mesh',
  'sculptMesh',
  'customNodes',
  'boolean',
  'csg',
  'sketch',
  'imageDataUrl',
  'sourceImageDataUrl',
  'deformers',
];

export function guidePart(p: ScenePart): ScenePart {
  const light = { ...p };

  for (const key of HEAVY) delete light[key];

  return light;
}

export function guideSteps(guide: MergeGuide, parts = guide.parts): number {
  return buildGuidePlan(approximateScene('', parts, guide.joints), guide.material).steps.length;
}

function unionStandIn(members: ScenePart[], keep: ScenePart): ScenePart {
  const boxes = members.map(partBounds);
  const min = [0, 1, 2].map((a) => Math.min(...boxes.map((b) => b.min[a])));
  const max = [0, 1, 2].map((a) => Math.max(...boxes.map((b) => b.max[a])));

  return {
    ...keep,
    position: min.map((v, a) => (v + max[a]) / 2) as V3,
    rotation: [0, 0, 0],
    dimensions: { width: max[0] - min[0], height: max[1] - min[1], depth: max[2] - min[2] },
  };
}

export function stepsSaved(guide: MergeGuide, before: number, merge: { ids: string[]; hardware: string[] }): number {
  const [keep, ...rest] = merge.ids;
  const gone = new Set([...rest, ...merge.hardware]);
  const members = guide.parts.filter((p) => merge.ids.includes(p.id));
  const kept = members.find((p) => p.id === keep);

  if (!kept) return 0;

  const standIn = unionStandIn(members, kept);
  const after = guide.parts.filter((p) => !gone.has(p.id)).map((p) => (p.id === keep ? standIn : p));

  return Math.max(0, before - guideSteps(guide, after));
}
