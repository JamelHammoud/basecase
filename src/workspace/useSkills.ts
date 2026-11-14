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
import { backgroundTasks, Debounce, designMoved, taskOf } from '../skills/kitPlan';
import { kitEntries } from '../skills/motorKit';
import { inSkillsWorker } from '../skills/skillsClient';
import { withRecord, type SkillRecord } from '../skills/skillRecords';
import type { Environment } from '../skills/environment';
import { watchPlan } from '../skills/liveWatch';
import type { SnapshotRef } from '../skills/snapshots';
import { readyVelocity, skillRows, type SkillJob, type SkillRefusals, type SkillRow } from '../skills/skillRows';
import { skillEnvironment } from '../skills/skillEnvironment';
import { skillsPlatform, type SkillsPlatform } from '../skills/skillsPlatform';
import { designOf, SkillsRuntime, type KitInstall } from '../skills/skillsRuntime';
import { teachExamples } from '../skills/teachExamples';
import type { ProjectSettings, ScenePart } from '../types/robotics';
import type { Rig } from '../utils/kinematics';
import { IS_WEB_DEMO } from '../utils/platform/webDemo';
import { platformBridge } from '../utils/platformBridge';
import { trainHandoff, useRoutineSkills, type HandoffJob } from './useRoutineSkills';
import { useSkillCoach } from './useSkillCoach';
import { useSkillStress } from './useSkillStress';

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
  const [refusals, setRefusals] = useState<SkillRefusals>({});
  const [platform] = useState(() => skillsPlatform({ web: IS_WEB_DEMO, workspaceId, store: platformBridge }));
  const [runtime] = useState(
    () =>
      new SkillsRuntime({
        runner: inSkillsWorker,
        forge: platform.forge,
        save: platform.save,
        loadSkill: platform.loadSkill,
        snapshots: platform.snapshots,
        onRecord: (record) => setProject((p) => ({ ...p, skills: withRecord(p.skills ?? [], record) })),
        onChange: setJobs,
        onRefused: (target, refusal) => setRefusals((r) => ({ ...r, [target]: refusal ?? undefined })),
      }),
  );

  useEffect(() => () => runtime.dispose(), [runtime]);

  return { runtime, platform, jobs, refusals };
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
  const animations = useRef(project.animations ?? []);

  useLayoutEffect(() => {
    records.current = project.skills ?? [];
    animations.current = project.animations ?? [];
  });

  useEffect(() => {
    if (!watch) return;

    debounce.run(() => {
      void buildModel().then(
        (built) => {
          const next = modelHashes(built);
          const rows = skillRows({
            model: built,
            design: designOf(built),
            records: records.current,
            jobs: [],
            animations: animations.current,
          });

          if (platform.background && designMoved(hashes.current, next))
            runtime.planBackground(built, backgroundTasks(rows));

          hashes.current = next;
          setModel(built);
        },
        () => null,
      );
    });
  }, [
    watch,
    parts,
    project.joints,
    project.servoCalibrations,
    project.animations,
    buildModel,
    runtime,
    platform,
    debounce,
  ]);

  useEffect(() => () => debounce.cancel(), [debounce]);

  return model;
}

export function useSkills(input: SkillsInput) {
  const { sim, project, rig, parts } = input;
  const hasJoints = rig.joints.length > 0;
  const available = useTabTraining(hasJoints) && hasJoints;
  const { runtime, platform, jobs, refusals } = useRuntime(input);
  const records = project.skills ?? [];
  const facts = robotFacts(rig, parts);
  const watch =
    available && (facts.morphology === 'legged' || records.length > 0 || jobs.length > 0 || !!project.policies?.length);
  const model = useSceneModel(input, { runtime, platform, watch });
  const animations = project.animations ?? [];
  const load = (record: SkillRecord) => platform.loadSkill(record.hash);
  const coach = useSkillCoach({ sim, model, records, loadSkill: platform.loadSkill, setProject: input.setProject });
  const stress = useSkillStress({
    runtime,
    sim,
    model,
    load: async (row) => (row.record ? load(row.record) : null),
    environmentOf: (row, built) => skillEnvironment(row, { model: built, runtime, animations }),
    stopReplay: coach.stopReplay,
  });
  const rows: SkillRow[] = model
    ? skillRows({ model, design: designOf(model), records, jobs, animations, refusals }).map((row) => ({
        ...row,
        stress: stress.of(row),
      }))
    : [];
  const velocityRecord = readyVelocity(rows);
  const examples = teachExamples(facts, footPoints(rig, parts).length);
  const routineSkills = useRoutineSkills({ rows, load, project, setProject: input.setProject });

  const velocity = async (): Promise<VelocityDrive | null> => {
    const skill = velocityRecord && model ? await load(velocityRecord) : null;

    if (skill?.controller.kind !== 'policy' || !model) return null;

    return { policy: skill.controller.policy, topSpeed: kitTopSpeed(model) };
  };

  const trainKit = async (entry: TrainedEntry) => runtime.trainKit(await sim.buildModel(), entry);

  const train = async (row: SkillRow) => {
    const built = await sim.buildModel();

    if ((row.kit || row.move) && row.record && row.state.kind === 'recheck')
      return runtime.recheck(built, taskOf(row, row.record, 'recheck'));

    if (row.move) return runtime.trainMove(built, row.move);

    return row.kit ? runtime.trainKit(built, row.kit) : null;
  };

  const rowEnvironment = (row: SkillRow): Environment | null => {
    try {
      return model ? skillEnvironment(row, { model, runtime, animations }) : null;
    } catch {
      return null;
    }
  };

  const playSnapshot = async (row: SkillRow, ref: SnapshotRef) => {
    const policy = row.record ? await runtime.loadSnapshot(ref, row.record.hash) : null;

    if (!policy) return;

    coach.stopReplay();

    if (sim.status === 'off') await sim.start();

    const robot = rowEnvironment(row)?.robot ?? model?.robots[0]?.key ?? '';

    sim.setConditions(null);
    sim.setController({ kind: 'policy', policy, robot });
    sim.reset();
  };

  const tryRow = async (row: SkillRow) => {
    const skill = row.record ? await load(row.record) : null;

    if (!skill) return;

    coach.stopReplay();

    if (sim.status === 'off') await sim.start();

    sim.setConditions(null);
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
    loadSkill: load,
    environmentOf: rowEnvironment,
    install: (built: SimModel, install: KitInstall) => runtime.installKit(built, install),
    velocity,
    velocityReady: !!velocityRecord,
    busy: jobs.some((j) => !j.background),
    canKit: (entry: TrainedEntry) => !!model && kitEntries(model).includes(entry),
    trainKit,
    train,
    tryRow,
    watchPlan: (row: SkillRow) => watchPlan(rowEnvironment(row)),
    loadSnapshot: (ref: SnapshotRef) => runtime.loadSnapshot(ref),
    playSnapshot,
    stop: () => runtime.stopUser(),
    coach,
    stress,
    routineSkills,
    trainHandoff: (job: HandoffJob) => trainHandoff({ runtime, routineSkills, project, job }),
  };
}

export type SceneSkills = ReturnType<typeof useSkills>;
