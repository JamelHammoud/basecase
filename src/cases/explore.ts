import { COMPONENT_BY_ID, componentVariant } from '../data/components';
import type { MeshMeasure } from '../three/meshMeasure';
import { volts } from '../utils/electric';
import type { CaseRuns } from './caseRuns';
import type { Design, DesignScene, ExploreSpace } from './exploreDesigns';

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
  const supply = design.volts === space.current.volts ? [] : [volts(design.volts)];

  return [...servos, ...supply].join('; ');
}
