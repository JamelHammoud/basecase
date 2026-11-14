import { loadCameraStage, renderTrainingFrame } from '../cameras/cameraStage';
import type { CameraTrainingFrame, CameraTrainingRequest } from '../cameras/trainingTypes';
import type { MeshFiles } from '../three/componentMeshes';
import { frameHash, type ImageAnnotation, type TrainingFrame } from './frameSet';
import { annotationFromInstances } from './imageMasks';
import {
  classForInstance,
  requestForImage,
  trainingPlan,
  type TrainingImagesJob,
  type TrainingPlan,
} from './trainingPlan';

export interface LoadedTrainingJob extends TrainingImagesJob {
  meshes?: MeshFiles;
}

export interface TrainingHeader {
  name: string;
  caseId: string;
  sceneId: string;
  seed: number;
  classes: TrainingPlan['classes'];
  count: number;
}

function annotations(plan: TrainingPlan, raw: CameraTrainingFrame): ImageAnnotation[] {
  return raw.instances.flatMap(({ id, instance }) => {
    const category = classForInstance(plan, instance, raw.variants);

    if (!category) return [];

    const keypoints = raw.keypoints
      .filter((p) => p.instance === instance)
      .map(({ name, x, y, visible }) => ({ name, x, y, visible }));
    const annotation = annotationFromInstances({ ...raw, instanceId: id, instance, classId: category.id, keypoints });

    return annotation ? [annotation] : [];
  });
}

export async function labelledFrame(
  plan: TrainingPlan,
  index: number,
  raw: CameraTrainingFrame,
): Promise<TrainingFrame> {
  const request = requestForImage(plan, index);
  const frame = {
    seed: request.seed,
    camera: request.key,
    width: raw.width,
    height: raw.height,
    jpeg: raw.jpeg,
    annotations: annotations(plan, raw),
    depth: raw.depth,
  };

  return { ...frame, id: await frameHash(frame) };
}

export class TrainingImageSession {
  private plan: TrainingPlan | null = null;

  private nextIndex = 0;

  async load(job: LoadedTrainingJob): Promise<TrainingHeader> {
    const plan = trainingPlan(job);

    if (!(await loadCameraStage({ ...plan, meshes: job.meshes })))
      throw new Error('Load the Case again before making images.');

    this.plan = plan;
    this.nextIndex = 0;

    return {
      name: plan.kase.name,
      caseId: plan.kase.id,
      sceneId: plan.sceneId,
      seed: plan.seed,
      classes: plan.classes,
      count: plan.count,
    };
  }

  async next(
    render: (request: CameraTrainingRequest) => Promise<CameraTrainingFrame> = renderTrainingFrame,
  ): Promise<TrainingFrame> {
    const plan = this.plan;
    const index = this.nextIndex;

    if (!plan || index >= plan.count) throw new Error('Start a frame set before rendering its images.');

    const raw = await render(requestForImage(plan, index));
    const frame = await labelledFrame(plan, index, raw);

    this.nextIndex++;

    return frame;
  }
}
