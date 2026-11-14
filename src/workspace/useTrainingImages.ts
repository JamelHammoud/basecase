import { useRef, useState } from 'react';
import { stageCase } from '../cases/caseCast';
import { worldItem, type Case } from '../cases/schema';
import { cameraViews } from '../cameras/views';
import { newDataset } from '../datasets/datasetFile';
import { saveDataset } from '../datasets/datasetStore';
import type { VisionFrame } from '../vision/frameSet';
import { imageClasses } from '../vision/imageScene';
import { makeImageManifest } from '../vision/makeImages';
import { saveFrame, saveFrameSetManifest } from '../vision/frameSetStore';
import { errorMessage } from '../utils/errorMessage';
import { caseNamed } from './agentCaseRun';
import { newId } from './helpers';
import { trainingImageInput, type TrainingImageInput } from './trainingImageRequest';
import type { SceneDocument } from './useSceneDocument';
import type { Posing } from '../utils/usePosing';
import type { SimTraining } from './useSimTraining';
import type { ShowToast } from './types';

interface Source {
  scene: { sceneId: string };
  docs: SceneDocument;
  posing: Pick<Posing, 'rig'>;
  simTraining: SimTraining;
  showToast: ShowToast;
}

function sceneOf(source: Source, authored: Case) {
  const parts = source.docs.parts;
  const project = source.docs.project;
  const staged = stageCase(authored, { rig: source.posing.rig, parts }, source.simTraining.cases.partners());
  const allParts = [...parts, ...staged.joined.parts];
  const world = staged.kase.world.objects.map(worldItem);

  return {
    parts: allParts,
    joints: [...(project.joints ?? []), ...staged.joined.joints],
    world,
    kase: staged.kase,
    views: cameraViews(allParts, world, project.cameras),
  };
}

export function useTrainingImages(source: Source) {
  const [opened, setOpened] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [problem, setProblem] = useState<string | null>(null);
  const running = useRef(false);
  const { cases, active } = source.simTraining.cases;
  const kase = cases.find((c) => c.id === opened) ?? null;
  const scene = kase ? sceneOf(source, kase) : null;
  const choices = scene ? { cameras: scene.views, classes: imageClasses(scene) } : null;

  const make = async (raw: TrainingImageInput) => {
    if (running.current) return { ok: false as const, problem: 'Training images are being made.' };

    running.current = true;
    setBusy(true);
    setProblem(null);

    try {
      const input = trainingImageInput({ ...raw });
      const authored = input.case ? caseNamed(cases, input.case) : (kase ?? active);

      if (!authored) throw new Error('Choose a Case.');

      setProgress({ done: 0, total: input.count });

      const classCounts = new Map<number, number>();
      const keepFrame = async (frame: VisionFrame) => {
        await saveFrame(frame);

        for (const a of frame.annotations) classCounts.set(a.classId, (classCounts.get(a.classId) ?? 0) + 1);
      };
      const set = await makeImageManifest(
        { ...sceneOf(source, authored), ...input, seed: input.seed ?? 0 },
        { onFrame: keepFrame, onProgress: setProgress },
      );

      await saveFrameSetManifest(set);

      const dataset = newDataset({
        id: newId('dataset'),
        name: set.name,
        task: authored.brief.trim() || authored.name,
        sceneId: source.scene.sceneId,
        caseId: authored.id,
        members: [],
        imageMembers: [{ frameSet: set.id, frames: set.frames, hash: set.id }],
        at: new Date().toISOString(),
      });

      await saveDataset(dataset);
      source.simTraining.triesPlaces.showDataset(dataset.id);
      setOpened(null);

      return {
        ok: true as const,
        id: set.id,
        dataset: dataset.id,
        count: set.frames.length,
        classes: set.classes.map((c) => ({ ...c, count: classCounts.get(c.id) ?? 0 })),
      };
    } catch (error) {
      const message = errorMessage(error);

      setProblem(message);
      source.showToast(message, { tone: 'error' });

      return { ok: false as const, problem: message };
    } finally {
      running.current = false;
      setBusy(false);
    }
  };

  return {
    opened,
    kase,
    choices,
    busy,
    progress,
    problem,
    canMake: cases.length > 0,
    open: (caseId?: string) => {
      setProblem(null);
      setOpened(caseId ?? active?.id ?? cases[0]?.id ?? null);
    },
    close: () => setOpened(null),
    make,
  };
}

export type TrainingImages = ReturnType<typeof useTrainingImages>;
