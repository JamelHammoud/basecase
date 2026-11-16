import type { HubSkillCandidate } from './hubBridge';
import type { SkillClient } from './skillDownloads.mjs';

export class SkillSearch {
  cachedBytes: number;
  find(client: SkillClient): Promise<HubSkillCandidate[]>;
}
