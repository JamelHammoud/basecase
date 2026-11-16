import { useEffect, useLayoutEffect, useRef, useState, type ComponentType } from 'react';
import type { SkillActions } from '../components/simulate/SkillsList';
import type { ForgeEvent } from '../forge/forgeWasm';
import type { RobotMorphology } from '../sim/morphology';
import type { Simulation } from '../sim/useSimulation';
import type { SkillRecord } from '../skills/skillRecords';
import type { SkillRow } from '../skills/skillRows';
import type { TabEngine } from '../skills/skillsPlatform';
import type { GalleryInstallProps } from './GalleryInstallSkill';
import type { GalleryTrainer } from './galleryTrainer';
import type { GalleryTrained } from './galleryTrained';
import { trainingOffered } from './trainingOffered';

export interface RunningSkill {
  hash: string;
  steps: number;
}

interface TrainingInput {
  slug: string;
  morphology: RobotMorphology;
  sim: Simulation;
}

function useOffered(morphology: RobotMorphology) {
  const [offered, setOffered] = useState(false);

  useEffect(() => {
    let live = true;

    void trainingOffered(morphology).then((ok) => live && setOffered(ok));

    return () => {
      live = false;
    };
  }, [morphology]);

  return offered;
}

export function useGalleryTraining({ slug, morphology, sim }: TrainingInput) {
  const offered = useOffered(morphology);
  const [rows, setRows] = useState<SkillRow[]>([]);
  const [starting, setStarting] = useState(false);
  const [installer, setInstaller] = useState<{
    Component: ComponentType<GalleryInstallProps>;
    trainer: GalleryTrainer;
    request: number;
  } | null>(null);
  const [running, setRunning] = useState<RunningSkill | null>(null);
  const pending = useRef<Promise<GalleryTrainer> | null>(null);
  const loaded = useRef<GalleryTrainer | null>(null);
  const simRef = useRef(sim);

  useLayoutEffect(() => {
    simRef.current = sim;
  });

  useEffect(() => () => loaded.current?.dispose(), []);

  const load = () =>
    (pending.current ??= import('./galleryTrainer').then((m) => {
      loaded.current = m.galleryTrainer({ slug, onRows: setRows });

      return loaded.current;
    }));

  const run = async (trainer: GalleryTrainer, record: SkillRecord) => {
    const skill = await trainer.skill(record);
    const live = simRef.current;

    if (!skill) return;

    if (live.status === 'off') await live.start();

    live.setController(skill.controller);
    live.reset();
    setRunning({
      hash: record.hash,
      steps: skill.controller.kind === 'policy' ? skill.controller.policy.trainedSteps : 0,
    });
  };

  const openInstall = async () => {
    const [trainer, module] = await Promise.all([load(), import('./GalleryInstallSkill')]);

    setInstaller((previous) => ({
      Component: module.GalleryInstallSkill,
      trainer,
      request: (previous?.request ?? 0) + 1,
    }));
  };

  const train = async (): Promise<SkillRecord | null> => {
    setStarting(true);

    try {
      const [trainer, model] = await Promise.all([load(), simRef.current.buildModel({ alone: true })]);
      const record = await trainer.train(model);

      if (record && !simRef.current.drive.active) await run(trainer, record);

      return record;
    } finally {
      setStarting(false);
    }
  };

  const actions: SkillActions = {
    onTrain: () => void train(),
    onTry: (row) => {
      const record = row.record;

      if (record) void load().then((trainer) => run(trainer, record));
    },
    onDrive: () => void simRef.current.drive.start(),
    onStop: () => loaded.current?.stop(),
  };

  return {
    offered,
    rows,
    starting,
    running,
    actions,
    train,
    velocity: () => loaded.current?.velocity() ?? Promise.resolve(null),
    openInstall: () => void openInstall(),
    installer,
    installProps: installer
      ? {
          request: installer.request,
          trainer: installer.trainer,
          buildModel: () => simRef.current.buildModel({ alone: true }),
          onInstalled: (record: SkillRecord) => {
            if (!simRef.current.drive.active) void run(installer.trainer, record);
          },
        }
      : null,
    events: (): ForgeEvent[] => loaded.current?.events() ?? [],
    carried: (): Promise<GalleryTrained | null> => loaded.current?.carried() ?? Promise.resolve(null),
    stubTabEngine: (engine: TabEngine | null) =>
      import('../skills/skillsPlatform').then((m) => m.stubTabEngine(engine)),
  };
}

export type GalleryTraining = ReturnType<typeof useGalleryTraining>;
