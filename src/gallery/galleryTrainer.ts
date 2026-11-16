import type { ForgeEvent } from '../forge/forgeWasm';
import type { VelocityDrive } from '../sim/driveAccess';
import { kitTopSpeed } from '../skills/kitModel';
import type { SimModel } from '../sim/mjcfTypes';
import type { Skill } from '../skills/artifacts';
import { kitEnvironment, type TrainedEntry } from '../skills/kitEnvironment';
import type { SkillHubSkills } from '../workspace/useSkillHub';
import { inSkillsWorker, type SkillRunner } from '../skills/skillsClient';
import { withRecord, type SkillRecord } from '../skills/skillRecords';
import { readyVelocity, skillRows, type SkillJob, type SkillRow, type SkillRefusals } from '../skills/skillRows';
import { skillsPlatform, type SkillStore } from '../skills/skillsPlatform';
import { designOf, SkillsRuntime, type KitInstall } from '../skills/skillsRuntime';
import { getSkill, saveSkill } from '../utils/platform/web/webSkills';
import type { GalleryTrained } from './galleryTrained';

export interface GalleryTrainer {
  train: (model: SimModel) => Promise<SkillRecord | null>;
  install: (model: SimModel, install: KitInstall) => Promise<SkillRecord | null>;
  hubSkills: (buildModel: () => Promise<SimModel>, onInstalled: (record: SkillRecord) => void) => SkillHubSkills;
  stop: () => void;
  velocity: () => Promise<VelocityDrive | null>;
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
  let retained: SkillRecord | null = null;
  let completed: SkillRecord | null = null;
  let jobs: SkillJob[] = [];
  let refusals: SkillRefusals = {};
  let selected: TrainedEntry = 'stand';
  const rows = () =>
    model
      ? skillRows({ model, design: designOf(model), records, jobs, refusals }).filter(
          (row) => row.kit === selected || row.state.kind === 'ready',
        )
      : [];
  const emit = () => options.onRows(rows());
  const ready = () => rows().find((row) => row.kit === selected && row.state.kind === 'ready')?.record ?? null;
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
      completed = record;
      retained = record;
      records = withRecord(records, record);
      emit();
    },
    onRefused: (target, refusal) => {
      refusals = { ...refusals, [target]: refusal ?? undefined };

      if (refusal) emit();
    },
    onChange: (next) => {
      jobs = next;
      emit();
    },
  });
  const skill = async (record: SkillRecord) => {
    const found = await platform.loadSkill(record.hash);

    if (found) retained = record;

    return found;
  };
  const startInstall = (built: SimModel, install: KitInstall) => {
    if (runtime.busy) return runtime.installKit(built, install);

    model = built;
    selected = install.entry;
    completed = null;

    return runtime.installKit(built, install);
  };
  const installed = async () => {
    await runtime.settled();

    return completed;
  };

  return {
    train: async (built) => {
      if (runtime.busy) return null;

      model = built;
      completed = null;

      if (runtime.trainKit(built, selected)) return null;

      return installed();
    },
    install: async (built, install) => (startInstall(built, install) ? null : installed()),
    hubSkills: (buildModel, onInstalled) => ({
      get model() {
        return model;
      },
      get rows() {
        return rows();
      },
      available: true,
      get busy() {
        return runtime.busy;
      },
      buildModel,
      loadSkill: skill,
      environmentOf: (row) => (model && row.kit ? kitEnvironment(model, row.kit) : null),
      install: (built, install) => {
        const busy = startInstall(built, install);

        if (!busy) void installed().then((record) => record && onInstalled(record));

        return busy;
      },
    }),
    velocity: async () => {
      const record = readyVelocity(rows());
      const found = record ? await skill(record) : null;

      return found?.controller.kind === 'policy' && model
        ? { policy: found.controller.policy, topSpeed: kitTopSpeed(model) }
        : null;
    },
    stop: () => runtime.stopUser(),
    skill,
    carried: async () => {
      const record = retained ?? ready();
      const found = record ? await skill(record) : null;

      return record && found ? { kind: 'skill', record, skill: found } : null;
    },
    events: () => events,
    dispose: () => runtime.dispose(),
  };
}
