import type { EarthOrigin } from '../earth/earthOrigin';
import type { InterfacePlan } from './interfaces';
import type { RobotSkeleton } from './skeleton';

export interface BuildGuideRecord {
  id: string;
  pages: number;
  steps: number;
  generatedAt: string;
  fingerprint: string;
  orderTimedOut?: boolean;
  coverDataUrl?: string;
  stepParts?: { fingerprint: string; ids: string[][] };
}

export interface LeaderLink {
  sceneId: string;
  robot: string;
  joints: Record<string, string>;
}

export interface ProjectRecords {
  buildGuide?: BuildGuideRecord;
  leads?: LeaderLink;
  skeleton?: RobotSkeleton;
  interfaces?: InterfacePlan;
  earth?: EarthOrigin;
}
