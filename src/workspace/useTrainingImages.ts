import { useRef, useState } from 'react';
import { cameraViews, findView, stripParts } from '../cameras/views';
import { castOf, stageCase } from '../cases/caseCast';
import { worldItem, type Case } from '../cases/schema';
import type { SlotRobot } from '../cases/slots';
import type { Simulation } from '../sim/useSimulation';
import type { ProjectSettings, ScenePart } from '../types/robotics';
import { errorMessage } from '../utils/errorMessage';
import type { Rig } from '../utils/kinematics';
import { makeTrainingImages, trainingImageClasses } from '../vision/trainingImagesClient';
import { trainingImageInput, type TrainingImageInput } from './trainingImageInput';
import type { ShowToast } from './types';

interface ImageOptions {
  parts: ScenePart[];
  project: ProjectSettings;
  active: Case | null;
  sim: Simulation;
  rig: Rig;
  partners: () => SlotRobot[];
  sceneId: string;
  showDataset: (id: string) => void;
  showToast: ShowToast;
}

type ImageResult = Awaited<ReturnType<typeof makeTrainingImages>>;

export function useTrainingImages(options: ImageOptions) {
  const { parts, project, active, sim, rig, sceneId, partners, showDataset, showToast } = options;
  const [open, setOpen] = useState(false);
  const [running, setRunning] = useState<{ done: number; total: number } | null>(null);
  const [last, setLast] = useState<ImageResult | null>(null);
  const busy = useRef(false);
  const staged = active ? stageCase(active, { rig, parts }, partners()) : null;
  const cast = staged ? castOf(staged, { rig, parts }) : { parts, rig };
  const world = staged ? staged.kase.world.objects.map(worldItem) : sim.worldParts;
  const views = cameraViews(stripParts(cast.parts), world, project.cameras);
  const classes = staged ? trainingImageClasses(stripParts(cast.parts), staged.kase, cast.rig) : [];

  const make = async (input: TrainingImageInput, kase: Case) => {
    if (busy.current) throw new Error('Training images are being made. Wait for them to finish.');

    const selected = trainingImageInput({ ...input });

    busy.current = true;
    setRunning({ done: 0, total: selected.count });
    setOpen(false);

    try {
      const staged = stageCase(kase, { rig, parts }, partners());
      const cast = castOf(staged, { rig, parts });
      const world = staged.kase.world.objects.map(worldItem);
      const currentViews = cameraViews(stripParts(cast.parts), world, project.cameras);
      const result = await makeTrainingImages(
        {
          parts: cast.parts,
          world,
          model: rig.joints.length ? await sim.buildModel({ alone: true }) : null,
          rig: cast.rig,
          views: currentViews,
          kase: staged.kase,
          sceneId,
          ...selected,
          cameras:
            selected.cameras?.map((name) => findView(currentViews, name)?.key ?? name) ??
            currentViews.map((view) => view.key),
          classes:
            selected.classes ??
            trainingImageClasses(stripParts(cast.parts), staged.kase, cast.rig).map((item) => item.name),
        },
        setRunning,
      );

      setLast(result);
      showDataset(result.dataset.id);

      return result;
    } finally {
      busy.current = false;
      setRunning(null);
    }
  };

  const submit = (input: TrainingImageInput) => {
    if (!active) return;

    void make(input, active).catch((error: unknown) => showToast(errorMessage(error), { tone: 'error' }));
  };

  return {
    open,
    running,
    last,
    views,
    classes,
    canMake: !!active && views.length > 0 && classes.length > 0,
    start: () => setOpen(true),
    close: () => setOpen(false),
    make,
    submit,
  };
}

export type TrainingImages = ReturnType<typeof useTrainingImages>;
