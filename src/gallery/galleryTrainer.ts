import type { ForgeEvent } from '../forge/forgeWasm';
import type { SimModel } from '../sim/mjcfTypes';
import type { Skill } from '../skills/artifacts';
import { inSkillsWorker, type SkillRunner } from '../skills/skillsClient';
import { withRecord, type SkillRecord } from '../skills/skillRecords';
import { skillRows, type SkillJob, type SkillRow } from '../skills/skillRows';
import { skillsPlatform, type SkillStore } from '../skills/skillsPlatform';
import { designOf, SkillsRuntime } from '../skills/skillsRuntime';
import { getSkill, saveSkill } from '../utils/platform/web/webSkills';
import type { GalleryTrained } from './galleryTrained';

export interface GalleryTrainer {
  train: (model: SimModel) => Promise<SkillRecord | null>;
  stop: () => void;
  skill: (record: SkillRecord) => Promise<Skill | null>;
  carried: () => Promise<GalleryTrained | null>;
  events: () => ForgeEvent[];
  dispose: () => void;
}

interface TrainerOptions {
  slug: string;
  onRows: (rows: SkillRow[]) => void;
  runner?: SkillRunner;
  store?: SkillStore;
}

const WEB_STORE: SkillStore = { saveSkill, getSkill };

export function galleryTrainer(options: TrainerOptions): GalleryTrainer {
  const events: ForgeEvent[] = [];
  let model: SimModel | null = null;
  let records: SkillRecord[] = [];
  let jobs: SkillJob[] = [];
  const rows = () =>
    model ? skillRows({ model, design: designOf(model), records, jobs }).filter((row) => row.kit === 'stand') : [];
  const emit = () => options.onRows(rows());
  const ready = () => rows().find((row) => row.state.kind === 'ready')?.record ?? null;
  const platform = skillsPlatform({
    web: true,
    workspaceId: `gallery-${options.slug}`,
    store: options.store ?? WEB_STORE,
    onForgeEvent: (event) => events.push(event),
  });
  const runtime = new SkillsRuntime({
    runner: options.runner ?? inSkillsWorker,
    forge: platform.forge,
    save: platform.save,
    loadSkill: platform.loadSkill,
    onRecord: (record) => {
      records = withRecord(records, record);
      emit();
    },
    onChange: (next) => {
      jobs = next;
      emit();
    },
  });
  const skill = (record: SkillRecord) => platform.loadSkill(record.hash);

  return {
    train: async (built) => {
      model = built;

      if (runtime.trainKit(built, 'stand')) return null;

      await runtime.settled();

      return ready();
    },
    stop: () => runtime.stopUser(),
    skill,
    carried: async () => {
      const record = ready();
      const found = record ? await skill(record) : null;

      return record && found ? { kind: 'skill', record, skill: found } : null;
    },
    events: () => events,
    dispose: () => runtime.dispose(),
  };
}
