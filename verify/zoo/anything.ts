import type { MainModule } from '@mujoco/mujoco';
import type { Skill } from '../../src/skills/artifacts';
import type { Contract } from '../../src/skills/contract';
import type { SignalSource } from '../../src/skills/environment';
import type { ForgeRunner, SkillSave } from '../../src/skills/forgeRunner';
import type { RaceCost } from '../../src/skills/raceTypes';
import type { Method } from '../../src/skills/router';
import type { SimModel } from '../../src/sim/mjcfTypes';
import { need } from '../lib/need';

export interface Proposal {
  contract: Contract;
  signals: Record<string, SignalSource>;
}

export type Approval =
  | { approved: true }
  | { approved: false; note: string; rollout?: { dt: number; qpos: number[][] }; shouldPass?: boolean };

export interface AnythingInput {
  mj: MainModule;
  prompt: string;
  design: string;
  model: SimModel;
  approve: (proposal: Proposal) => Promise<Approval>;
  forge: ForgeRunner;
  save: SkillSave;
  budget: { steps: number; wallS: number };
  signal: AbortSignal;
  method?: Method;
}

export type AnythingOutcome =
  | { kind: 'skill'; skill: Skill; method: Method; cost: RaceCost }
  | { kind: 'not-found'; reason: string; cost: RaceCost }
  | { kind: 'refused'; reason: string }
  | { kind: 'unverifiable'; reason: string };

export interface AnythingModule {
  trainAnything: (input: AnythingInput) => Promise<AnythingOutcome>;
}

export const loadAnything = () => need<AnythingModule>('src/skills/anything', ['trainAnything']);
