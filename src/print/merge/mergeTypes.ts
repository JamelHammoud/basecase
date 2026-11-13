import type { PrintMaterial } from '../../types/robotics';
import type { Bed } from '../bed';
import type { MergeGuide } from './mergeGuide';

export interface MergeCandidate {
  id: string;
  link: string;
  material: PrintMaterial;
  anchors: number;
}

export interface MergeInput {
  candidates: MergeCandidate[];
  groups: Record<string, string | undefined>;
  bed: Bed;
  guide: MergeGuide;
}

export type LeftOutReason =
  | { code: 'seals'; part: string }
  | { code: 'stuck'; part: string }
  | { code: 'bed' }
  | { code: 'support'; mm3: number };

export interface LeftOut {
  id: string;
  why: LeftOutReason;
}

export interface MergeGroup {
  keep: string;
  ids: string[];
  link: string;
  material: PrintMaterial;
  screws: string[];
  hardware: string[];
  steps: number;
  left: LeftOut[];
}

export interface MergePlan {
  groups: MergeGroup[];
  ms: number;
}

export const mergeSavings = (g: Pick<MergeGroup, 'ids' | 'screws' | 'steps'>) => ({
  parts: g.ids.length - 1,
  screws: g.screws.length,
  steps: g.steps,
});
