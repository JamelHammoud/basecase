import type { PartDeformers, PartDimensions, PartKind, PartRole } from './robotics';

export interface ProjectSummaryForAI {
  projectName: string;
  globalDesignGoal: string;
  units: 'mm';
  timestamp: string;
  boundingBoxMm: {
    width: number;
    height: number;
    depth: number;
  };
  parts: Array<{
    id: string;
    name: string;
    kind: PartKind;
    customModelId?: string;
    role: PartRole;
    mechanicalTag: string;
    positionMm: { x: number; y: number; z: number };
    rotationDeg: { x: number; y: number; z: number };
    dimensionsMm: PartDimensions;
    deformers?: PartDeformers;
    aiNote: string;
  }>;
  spatialRelationships: string[];
  annotations?: Array<{
    id: string;
    positionMm: { x: number; y: number; z: number };
    attachedPart?: string;
    comments: string[];
  }>;
}
