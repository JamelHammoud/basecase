import { COMPONENT_BY_ID } from '../data/components';
import { specLens } from '../cameras/optics';
import { cameraViews } from '../cameras/views';
import { LiveStage } from '../cameras/liveStage';
import type { CameraTrainingFrame, CameraTrainingRequest, TrainingObjectVariation } from '../cameras/trainingTypes';
import { decodeRecording } from '../cases/recordingFile';
import { sha256 } from '../cases/tries';
import type { StoredTry } from '../cases/tryFile';
import { framePoses, type Recording } from '../sim/recorder';
import { errorMessage } from '../utils/errorMessage';
import { checkedTryScene } from '../vision/tryFramePlan';
import type { TryFrameScene } from '../vision/tryFramesTypes';
import { summarizeVisibility, visibilitySample, type VisibilityPixels, type StudyVisibilityResult } from './visibility';
import { visibilityPlan, VISIBILITY_WIDTH, VISIBILITY_HEIGHT, type StudyVisibilityRequest } from './visibilityPlan';
import type { StudyScene } from './types';

export interface VisibilityLoad {
  scene: TryFrameScene;
  stored: StoredTry;
  bytes: Uint8Array;
  request: StudyVisibilityRequest;
  candidates: number;
}

interface VisibilityStage {
  setModel: LiveStage['setModel'];
  setViews: LiveStage['setViews'];
  setScene: LiveStage['setScene'];
  training: (request: CameraTrainingRequest) => Promise<CameraTrainingFrame>;
  dispose: () => void;
}

function appearance(recording: Pick<Recording, 'world'>, at: number) {
  const objects: Record<string, TrainingObjectVariation> = {};

  for (const event of recording.world ?? []) {
    if (Math.fround(event.at) > at || event.visible === undefined) continue;

    objects[event.id] = { visible: event.visible };
  }

  return { objects };
}

async function capturePixels(
  stage: VisibilityStage,
  request: CameraTrainingRequest,
  targets: StudyVisibilityRequest['targets'],
  onError: (error: unknown) => void,
) {
  const actual = await stage.training(request);
  const pixels: Record<string, VisibilityPixels> = {};

  for (const target of targets) {
    try {
      const isolated = await stage.training({ ...request, isolate: target.id });

      pixels[target.id] = visibilitySample(actual, isolated, target.id);
    } catch (failure) {
      onError(failure);
    }
  }

  return pixels;
}

export class StudyVisibilitySession {
  private stage: VisibilityStage | null = null;
  private input: Omit<VisibilityLoad, 'bytes'> | null = null;
  private recording: Pick<Recording, 'world'> | null = null;
  private plan: ReturnType<typeof visibilityPlan> | null = null;
  private key = '';
  private poses: Float64Array[] = [];

  private readonly createStage: () => VisibilityStage;

  constructor(createStage: () => VisibilityStage = () => new LiveStage()) {
    this.createStage = createStage;
  }

  async load(input: VisibilityLoad) {
    this.dispose();

    if (input.bytes.byteLength > 64 * 1024 * 1024) throw new Error('Choose a try smaller than 64 MiB.');

    const recording = decodeRecording(input.bytes);

    if (!recording || input.scene.parts.length + input.scene.world.length > 256)
      throw new Error('Choose a try with at most 256 robot and world parts.');

    if (input.stored.source !== 'case' && input.stored.source !== 'generated')
      throw new Error('Choose a simulated Case try.');

    if (input.stored.id !== input.request.tryId || input.scene.kase?.id !== input.stored.case?.id)
      throw new Error('Choose a try from this Case.');

    await checkedTryScene({ scene: input.scene, stored: input.stored, recording });

    const plan = visibilityPlan(input.request, recording, input.candidates);
    const objects = [...input.scene.parts, ...input.scene.world];
    const ids = new Set(objects.map((part) => part.id));

    if (ids.size !== objects.length || input.request.targets.some((target) => !ids.has(target.id)))
      throw new Error('Choose distinct target identities from the recorded scene.');

    if (
      input.request.cameras.some(
        (id) => !input.scene.parts.some((part) => part.id === id && input.scene.views.some((view) => view.part === id)),
      )
    )
      throw new Error('Choose camera parts from the recorded scene.');

    const unknownLens = input.scene.parts.some(
      (part) =>
        input.request.cameras.includes(part.id) &&
        !part.cameraLens &&
        !specLens(COMPONENT_BY_ID[part.componentId ?? '']?.specs ?? []),
    );

    if (unknownLens) throw new Error('Set a lens angle for each camera before measuring visibility.');

    const hash = await crypto.subtle.digest('SHA-256', Uint8Array.from(input.bytes));

    this.key = await sha256(
      JSON.stringify({
        request: input.request,
        model: input.stored.robot.modelHash,
        recording: Array.from(new Uint8Array(hash)),
      }),
    );
    this.input = { scene: input.scene, stored: input.stored, request: input.request, candidates: input.candidates };
    this.recording = { world: recording.world };
    this.poses = plan.indices.map((index) => framePoses(recording, index));

    if (this.poses.some((poses) => poses.some((value) => !Number.isFinite(value))))
      throw new Error('Restore finite body poses in the source try.');

    this.plan = plan;

    return this.key;
  }

  async measure(scene: StudyScene): Promise<StudyVisibilityResult> {
    const { input, recording, plan } = this;

    if (!input || !recording || !plan) throw new Error('Choose the source try before measuring visibility.');

    this.stage ??= this.createStage();

    const stage = this.stage;

    stage.setModel(input.scene.model);

    const started = performance.now();
    const replacements = new Map(scene.parts.map((part) => [part.id, part]));
    const parts = input.scene.parts.map((part) => replacements.get(part.id) ?? part);
    const views = cameraViews(parts, input.scene.world, scene.project.cameras);
    const selected = input.request.cameras.map((id) => views.find((view) => view.part === id));

    if (selected.some((view) => !view)) throw new Error('Restore the cameras used by this Study.');

    stage.setViews(views);

    if (!(await stage.setScene(parts, input.scene.world, input.scene.meshes, input.scene.imported)))
      throw new Error('Restore the source scene before measuring visibility.');

    const preparationMs = performance.now() - started;
    const rendering = performance.now();
    const captures: Array<Array<Record<string, VisibilityPixels> | null>> = [];
    let error: string | undefined;

    for (const view of selected) {
      const samples: Array<Record<string, VisibilityPixels> | null> = [];

      for (const i of plan.indices.keys()) {
        const request = {
          poses: this.poses[i],
          key: view!.key,
          width: VISIBILITY_WIDTH,
          height: VISIBILITY_HEIGHT,
          seed: 0,
          keypoints: [],
          labelsOnly: true,
          requireGeometry: true,
          randomization: appearance(recording, plan.times[i]),
        };

        try {
          samples.push(
            await capturePixels(stage, request, input.request.targets, (failure) => {
              error = errorMessage(failure);
            }),
          );
        } catch (failure) {
          error = errorMessage(failure);
          samples.push(null);
        }
      }

      captures.push(samples);
    }

    return {
      ...summarizeVisibility({
        key: this.key,
        width: VISIBILITY_WIDTH,
        height: VISIBILITY_HEIGHT,
        times: plan.times,
        end: plan.end,
        targets: input.request.targets,
        cameras: input.request.cameras,
        captures,
      }),
      preparationMs,
      renderMs: performance.now() - rendering,
      ...(error ? { error } : {}),
    };
  }

  dispose() {
    this.stage?.dispose();
    this.stage = null;
    this.input = null;
    this.recording = null;
    this.plan = null;
    this.poses = [];
  }
}
