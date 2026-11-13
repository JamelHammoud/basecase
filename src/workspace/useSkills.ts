import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { robotFacts } from '../cases/robotFit';
import type { VelocityDrive } from '../sim/driveAccess';
import { footPoints } from '../sim/driveLegs';
import type { SimModel } from '../sim/mjcfTypes';
import type { Simulation } from '../sim/useSimulation';
import { tabTrainingReady } from '../forge/tabSupport';
import { modelHashes, type ModelHashes } from '../skills/artifacts';
import type { TrainedEntry } from '../skills/kitEnvironment';
import { kitTopSpeed } from '../skills/kitModel';
import { backgroundTasks, Debounce, designMoved } from '../skills/kitPlan';
import { kitEntries } from '../skills/motorKit';
import { inSkillsWorker } from '../skills/skillsClient';
import { withRecord, type SkillRecord } from '../skills/skillRecords';
import { readyVelocity, skillRows, type SkillJob, type SkillRow } from '../skills/skillRows';
import { skillsPlatform, type SkillsPlatform } from '../skills/skillsPlatform';
import { designOf, SkillsRuntime } from '../skills/skillsRuntime';
import { teachExamples } from '../skills/teachExamples';
import type { ProjectSettings, ScenePart } from '../types/robotics';
import type { Rig } from '../utils/kinematics';
import { IS_WEB_DEMO } from '../utils/platform/webDemo';
import { platformBridge } from '../utils/platformBridge';

const BUILD_DEBOUNCE_MS = 1500;

interface SkillsInput {
  workspaceId: string;
  sim: Simulation;
  project: ProjectSettings;
  setProject: (update: (p: ProjectSettings) => ProjectSettings) => void;
  rig: Rig;
  parts: ScenePart[];
}

function useRuntime({ workspaceId, setProject }: Pick<SkillsInput, 'workspaceId' | 'setProject'>) {
  const [jobs, setJobs] = useState<SkillJob[]>([]);
  const [platform] = useState(() => skillsPlatform({ web: IS_WEB_DEMO, workspaceId, store: platformBridge }));
  const [runtime] = useState(
    () =>
      new SkillsRuntime({
        runner: inSkillsWorker,
        forge: platform.forge,
        save: platform.save,
        loadSkill: platform.loadSkill,
        onRecord: (record) => setProject((p) => ({ ...p, skills: withRecord(p.skills ?? [], record) })),
        onChange: setJobs,
      }),
  );

  useEffect(() => () => runtime.dispose(), [runtime]);

  return { runtime, platform, jobs };
}

function useTabTraining(hasJoints: boolean) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!IS_WEB_DEMO || !hasJoints) return;

    let live = true;

    void tabTrainingReady().then((ok) => live && setReady(ok));

    return () => {
      live = false;
    };
  }, [hasJoints]);

  return !IS_WEB_DEMO || ready;
}

interface ModelWatch {
  runtime: SkillsRuntime;
  platform: SkillsPlatform;
  watch: boolean;
}

function useSceneModel(input: SkillsInput, { runtime, platform, watch }: ModelWatch) {
  const { parts, project } = input;
  const { buildModel } = input.sim;
  const [model, setModel] = useState<SimModel | null>(null);
  const [debounce] = useState(() => new Debounce(BUILD_DEBOUNCE_MS));
  const hashes = useRef<ModelHashes | null>(null);
  const records = useRef<SkillRecord[]>([]);

  useLayoutEffect(() => {
    records.current = project.skills ?? [];
  });

  useEffect(() => {
    if (!watch) return;

    debounce.run(() => {
      void buildModel().then(
        (built) => {
          const next = modelHashes(built);
          const rows = skillRows({ model: built, design: designOf(built), records: records.current, jobs: [] });

          if (platform.background && designMoved(hashes.current, next))
            runtime.planBackground(built, backgroundTasks(rows));

          hashes.current = next;
          setModel(built);
        },
        () => null,
      );
    });
  }, [watch, parts, project.joints, project.servoCalibrations, buildModel, runtime, platform, debounce]);

  useEffect(() => () => debounce.cancel(), [debounce]);

  return model;
}

export function useSkills(input: SkillsInput) {
  const { sim, project, rig, parts } = input;
  const hasJoints = rig.joints.length > 0;
  const available = useTabTraining(hasJoints) && hasJoints;
  const { runtime, platform, jobs } = useRuntime(input);
  const records = project.skills ?? [];
  const facts = robotFacts(rig, parts);
  const watch = available && (facts.morphology === 'legged' || records.length > 0 || !!project.policies?.length);
  const model = useSceneModel(input, { runtime, platform, watch });
  const rows: SkillRow[] = model ? skillRows({ model, design: designOf(model), records, jobs }) : [];
  const velocityRecord = readyVelocity(rows);
  const examples = teachExamples(facts, footPoints(rig, parts).length);

  const load = (record: SkillRecord) => platform.loadSkill(record.hash);

  const velocity = async (): Promise<VelocityDrive | null> => {
    const skill = velocityRecord && model ? await load(velocityRecord) : null;

    if (skill?.controller.kind !== 'policy' || !model) return null;

    return { policy: skill.controller.policy, topSpeed: kitTopSpeed(model) };
  };

  const trainKit = async (entry: TrainedEntry) => runtime.trainKit(await sim.buildModel(), entry);

  const train = async (row: SkillRow) => {
    const built = await sim.buildModel();

    if (row.kit && row.record && row.state.kind === 'recheck')
      return runtime.recheck(built, { entry: row.kit, kind: 'recheck', record: row.record });

    return row.kit ? runtime.trainKit(built, row.kit) : null;
  };

  const tryRow = async (row: SkillRow) => {
    const skill = row.record ? await load(row.record) : null;

    if (!skill) return;

    if (sim.status === 'off') await sim.start();

    sim.setController(skill.controller);
    sim.reset();
  };

  return {
    runtime,
    available,
    model,
    buildModel: sim.buildModel,
    rows,
    examples,
    velocity,
    velocityReady: !!velocityRecord,
    canKit: (entry: TrainedEntry) => !!model && kitEntries(model).includes(entry),
    trainKit,
    train,
    tryRow,
    stop: () => runtime.stopUser(),
  };
}

export type SceneSkills = ReturnType<typeof useSkills>;
