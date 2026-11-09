import type { SimModel } from '../sim/mjcfTypes';
import type { TrainedEntry } from '../skills/kitEnvironment';
import type { ForgeEvent } from './forgeWasm';
import type { TabKitResult } from './tabTraining';

export interface ForgeHook {
  train: (options: { robot?: string; entry?: TrainedEntry }) => Promise<TabKitResult>;
  events: () => ForgeEvent[];
}

export function forgeHook(design: string, current: () => SimModel | null): ForgeHook {
  const events: ForgeEvent[] = [];

  return {
    events: () => events,
    train: async ({ robot, entry = 'stand' }) => {
      const { trainKitInTab } = await import('./tabTraining');
      const model = robot ? (await import('../skills/fixtureModels')).fixtureModel(robot) : current();

      if (!model) throw new Error('The robot isn’t built.');

      return trainKitInTab({ model, design: robot ?? design, entry, onEvent: (e) => events.push(e) });
    },
  };
}
