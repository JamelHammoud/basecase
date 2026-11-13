import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { SkillActions } from '../components/simulate/SkillsList';
import type { ForgeEvent } from '../forge/forgeWasm';
import type { RobotMorphology } from '../sim/morphology';
import type { Simulation } from '../sim/useSimulation';
import type { SkillRecord } from '../skills/skillRecords';
import type { SkillRow } from '../skills/skillRows';
import type { TabEngine } from '../skills/skillsPlatform';
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
    onDrive: () => {},
    onStop: () => loaded.current?.stop(),
  };

  return {
    offered,
    rows,
    starting,
    running,
    actions,
    train,
    events: (): ForgeEvent[] => loaded.current?.events() ?? [],
    carried: (): Promise<GalleryTrained | null> => loaded.current?.carried() ?? Promise.resolve(null),
    stubTabEngine: (engine: TabEngine | null) =>
      import('../skills/skillsPlatform').then((m) => m.stubTabEngine(engine)),
  };
}

export type GalleryTraining = ReturnType<typeof useGalleryTraining>;
