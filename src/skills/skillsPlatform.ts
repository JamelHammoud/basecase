import type { ForgeEvent } from '../forge/forgeWasm';
import type { TabForgeOptions } from '../forge/tabForge';
import type { Skill } from './artifacts';
import type { ForgeRunner, SkillSave } from './forgeRunner';
import type { ForgeFactory } from './skillsRuntime';
import { bridgeSnapshots, NO_SNAPSHOT_STORE, type SnapshotRef, type Snapshots } from './snapshots';
import { trainerForge, trainingProgress, type ForgeProgress } from './trainerForge';

export type TabEngine = (options: TabForgeOptions) => ForgeRunner;

export interface SkillStore {
  saveSkill: (payload: { hash: string; text: string }) => Promise<unknown>;
  getSkill: (hash: string) => Promise<unknown>;
  getSnapshot?: (ref: { run: string; iteration: number; skill?: string }) => Promise<unknown>;
  keepSnapshots?: (payload: { hash: string; snapshots: SnapshotRef[] }) => Promise<unknown>;
}

export interface SkillsPlatform {
  forge: ForgeFactory;
  save: SkillSave;
  loadSkill: (hash: string) => Promise<Skill | null>;
  snapshots: Snapshots;
  background: boolean;
}

interface PlatformOptions {
  web: boolean;
  workspaceId: string;
  store: SkillStore;
  tabEngine?: () => Promise<TabEngine>;
  onForgeEvent?: (event: ForgeEvent) => void;
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

function tabForgeFactory(load: () => Promise<TabEngine>, tee?: (event: ForgeEvent) => void): ForgeFactory {
  return ({ onProgress, signal }) => {
    let runner: Promise<ForgeRunner> | null = null;
    const onEvent = (event: ForgeEvent) => {
      const progress = tabProgress(event);

      tee?.(event);

      if (progress) onProgress(progress);
    };

    return async (job) => {
      runner ??= load().then((engine) => engine({ onEvent, signal }));

      return (await runner)(job);
    };
  };
}

function snapshotStore(web: boolean, store: SkillStore): Snapshots {
  const { getSnapshot, keepSnapshots } = store;

  if (web || !getSnapshot || !keepSnapshots) return NO_SNAPSHOT_STORE;

  return bridgeSnapshots({ getSnapshot, keepSnapshots });
}

export function skillsPlatform(options: PlatformOptions): SkillsPlatform {
  const { web, workspaceId, store } = options;

  return {
    forge: web
      ? tabForgeFactory(options.tabEngine ?? loadTabEngine, options.onForgeEvent)
      : (o) => trainerForge({ ...o, workspaceId }),
    save: async (path, text) => {
      const hash = HASH_IN_PATH.exec(path)?.[1];

      if (!hash) throw new Error('A skill is saved under its hash.');

      await store.saveSkill({ hash, text });
    },
    loadSkill: async (hash) => {
      const found = await store.getSkill(hash).catch(() => null);

      return isSkill(found) ? found : null;
    },
    snapshots: snapshotStore(web, store),
    background: !web,
  };
}
