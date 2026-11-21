import { applySpec, specToPart, type AgentPartSpec } from './agentScene';
import type { ScenePart } from '../types/robotics';
import type { SheetProfile } from '../types/sheet';

export interface AgentPartJob {
  spec: AgentPartSpec;
  part?: ScenePart;
  profile?: SheetProfile;
}

export function prepareAgentPart({ part, spec, profile }: AgentPartJob): ScenePart {
  return part ? applySpec(part, spec, profile) : specToPart(spec, profile);
}
