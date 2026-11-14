import { COMPONENT_BY_ID, componentVariant } from '../data/components';
import type { MeshMeasure } from '../three/meshMeasure';
import type { PurchaseRecord } from '../types/robotics';
import { jsonHash } from '../utils/geometryHash';
import { robotTotals } from './caseCompare';
import type { CaseRuns } from './caseRuns';
import { caseIdentity } from './caseStore';
import {
  designKey,
  designScene,
  exploreDesigns,
  exploreSpace,
  type Design,
  type DesignScene,
  type ExploreSpace,
} from './exploreDesigns';

export {
  designKey,
  designScene,
  exploreDesigns,
  exploreSpace,
  MAX_DESIGNS,
  sameDesign,
  sceneDesign,
  supplyVolts,
} from './exploreDesigns';
export type { Design, DesignScene, ExploreSpace, ServoGroup } from './exploreDesigns';

export const EXPLORE_RUNS = 8;

export const exploreCaseKey = (kase: object): string => jsonHash(caseIdentity(kase));

export interface ExploreBase extends DesignScene {
  measures: Record<string, MeshMeasure | undefined>;
  partTriangles: (id: string) => Float32Array | null;
}

export interface ExploreRobot extends ExploreBase {
  servoVolts: number;
}

export interface DesignChange {
  joints: string[];
  variant: string;
  mpn: string;
}

export interface ExploredDesign {
  key: string;
  design: Design;
  changes: DesignChange[];
  runs: CaseRuns;
  costUsd: number;
  massG: number;
}

export interface ExploreOptions {
  runs: (robot: ExploreRobot) => Promise<CaseRuns>;
  purchases: Record<string, PurchaseRecord>;
  designs?: Design[];
  stopped?: () => boolean;
  onDesign?: (row: ExploredDesign) => void;
}

function variantOf(componentId: string, id: string) {
  const c = COMPONENT_BY_ID[componentId];
  const v = c && componentVariant(c, id);
  const label = v?.label ?? id;

  return { name: /\(([^)]+)\)$/.exec(label)?.[1] ?? label, mpn: v?.mpn ?? id };
}

export function designChanges(space: ExploreSpace, design: Design): DesignChange[] {
  const changes: DesignChange[] = [];

  space.groups.forEach((g, i) => {
    const variant = design.variants[i];

    if (variant === g.current) return;

    const { name, mpn } = variantOf(g.componentId, variant);
    const same = changes.find((c) => c.mpn === mpn);

    if (same) same.joints.push(g.name);
    else changes.push({ joints: [g.name], variant: name, mpn });
  });

  return changes;
}

export const designServos = (space: ExploreSpace, design: Design) =>
  space.groups.map((g, i) => ({ joint: g.name, mpn: variantOf(g.componentId, design.variants[i]).mpn }));

export function designLabel(space: ExploreSpace, design: Design): string {
  const all = space.groups.length > 1;
  const servos = designChanges(space, design).map(({ joints, variant }) =>
    all && joints.length === space.groups.length ? `All ${variant}` : `${joints.join(', ')} ${variant}`,
  );
  const volts = design.volts === space.current.volts ? [] : [`${design.volts} V`];

  return [...servos, ...volts].join('; ');
}

export async function exploreCase(base: ExploreBase, options: ExploreOptions): Promise<ExploredDesign[]> {
  const space = exploreSpace(base.parts, base.project);

  if (!space) return [];

  const rows: ExploredDesign[] = [];

  for (const design of options.designs ?? exploreDesigns(space)) {
    if (options.stopped?.()) break;

    const scene = designScene(base, space, design);
    const runs = await options.runs({ ...base, ...scene, servoVolts: design.volts });

    if (options.stopped?.()) break;

    const row: ExploredDesign = {
      key: designKey(design),
      design,
      changes: designChanges(space, design),
      runs,
      ...robotTotals({ ...scene, measures: base.measures }, options.purchases),
    };

    rows.push(row);
    options.onDesign?.(row);
  }

  return rows;
}
