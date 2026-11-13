import type { SkillRecord } from '../skills/skillRecords';
import type { ForgeEvent } from './forgeWasm';

export interface ForgeHook {
  train: () => Promise<SkillRecord | null>;
  events: () => ForgeEvent[];
}

export const forgeHook = (trainer: ForgeHook): ForgeHook => ({
  train: () => trainer.train(),
  events: () => trainer.events(),
});
