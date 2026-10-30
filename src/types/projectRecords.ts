import type { InterfacePlan } from './interfaces';
import type { RobotSkeleton } from './skeleton';

export interface BuildGuideRecord {
  id: string;
  pages: number;
  steps: number;
  generatedAt: string;
  fingerprint: string;
  coverDataUrl?: string;
}

export interface ProjectRecords {
  buildGuide?: BuildGuideRecord;
  skeleton?: RobotSkeleton;
  interfaces?: InterfacePlan;
}
