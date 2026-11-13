import type { ForgeEvent } from '../forge/forgeWasm';
import type { TabForgeOptions } from '../forge/tabForge';
import type { Skill } from './artifacts';
import type { ForgeRunner, SkillSave } from './forgeRunner';
import type { ForgeFactory } from './skillsRuntime';
import { trainerForge, trainingProgress, type ForgeProgress } from './trainerForge';

export type TabEngine = (options: TabForgeOptions) => ForgeRunner;

export interface SkillStore {
  saveSkill: (payload: { hash: string; text: string }) => Promise<unknown>;
  getSkill: (hash: string) => Promise<unknown>;
}

export interface SkillsPlatform {
  forge: ForgeFactory;
  save: SkillSave;
  loadSkill: (hash: string) => Promise<Skill | null>;
  background: boolean;
}

interface PlatformOptions {
  web: boolean;
  workspaceId: string;
  store: SkillStore;
  tabEngine?: () => Promise<TabEngine>;
}

const HASH_IN_PATH = /([0-9a-f]{64})\/skill\.json$/;

let stubbedTab: TabEngine | null = null;

export const stubTabEngine = (engine: TabEngine | null) => {
  stubbedTab = engine;
};

const loadTabEngine = async (): Promise<TabEngine> => stubbedTab ?? (await import('../forge/tabForge')).tabForge;

const isSkill = (value: unknown): value is Skill =>
  typeof value === 'object' && value !== null && (value as { format?: unknown }).format === 'basecase-skill';

export const tabProgress = (event: ForgeEvent): ForgeProgress | null =>
  trainingProgress(event.type, { message: event.message, progress: event });

function tabForgeFactory(load: () => Promise<TabEngine>): ForgeFactory {
  return ({ onProgress, signal }) => {
    let runner: Promise<ForgeRunner> | null = null;
    const onEvent = (event: ForgeEvent) => {
      const progress = tabProgress(event);

      if (progress) onProgress(progress);
    };

    return async (job) => {
      runner ??= load().then((engine) => engine({ onEvent, signal }));

      return (await runner)(job);
    };
  };
}

export function skillsPlatform(options: PlatformOptions): SkillsPlatform {
  const { web, workspaceId, store } = options;

  return {
    forge: web ? tabForgeFactory(options.tabEngine ?? loadTabEngine) : (o) => trainerForge({ ...o, workspaceId }),
    save: async (path, text) => {
      const hash = HASH_IN_PATH.exec(path)?.[1];

      if (!hash) throw new Error('A skill is saved under its hash.');

      await store.saveSkill({ hash, text });
    },
    loadSkill: async (hash) => {
      const found = await store.getSkill(hash).catch(() => null);

      return isSkill(found) ? found : null;
    },
    background: !web,
  };
}
