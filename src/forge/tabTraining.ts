import type { SimModel } from '../sim/mjcfTypes';
import type { TrainedEntry } from '../skills/kitEnvironment';
import { inSkillsWorker } from '../skills/skillsClient';
import type { ForgeEvent } from './forgeWasm';
import { tabForge } from './tabForge';

export interface TabKitRequest {
  model: SimModel;
  design: string;
  entry: TrainedEntry;
  onEvent?: (event: ForgeEvent) => void;
  signal?: AbortSignal;
}

export interface TabKitResult {
  passed: boolean;
  summary: string;
  wallS: number;
  steps: number;
  forgeRuns: number;
}

export async function trainKitInTab(request: TabKitRequest): Promise<TabKitResult> {
  const { model, design, entry, onEvent, signal } = request;
  const reply = await inSkillsWorker(
    { type: 'kit', model, design, entry },
    {
      forge: tabForge({ onEvent, signal }),
      save: () => Promise.resolve(),
      signal,
    },
  );
  const outcome = reply.outcome;
  const { wallS, steps, forgeRuns } = outcome.cost;

  if (outcome.kind === 'refused') return { passed: false, summary: outcome.reason, wallS, steps, forgeRuns };

  return {
    passed: !!outcome.skill.evidence?.passed,
    summary: outcome.skill.evidence?.summary ?? '',
    wallS,
    steps,
    forgeRuns,
  };
}
