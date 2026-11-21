import type { BuildRepairPlan } from './buildRepairPlan';

export interface BuildRepairRecord {
  id: string;
  build: string;
  source: string;
  target: string;
  affected: string[];
  plan: BuildRepairPlan;
  createdAt: string;
  state: 'active' | 'incomplete' | 'cancelled' | 'complete';
  index: number;
  count: number;
  completed: Record<string, string>;
  completedAt?: string;
  allocationEvidence?: { at: string; signature: string };
  fleet?: { organization: string; robot: string };
}
