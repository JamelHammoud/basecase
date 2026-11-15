import { loadCameraStage, renderTrainingFrame } from '../cameras/cameraStage';
import type { CameraTrainingFrame, CameraTrainingRequest, TrainingObjectVariation } from '../cameras/trainingTypes';
import type { StoredTry } from '../cases/tryFile';
import { seedOf } from '../datasets/datasetFile';
import { framePoses } from '../sim/recorder';
import { frameHash, type FrameSet, type TrainingFrame } from './frameSet';
import { compressedImageTopics, openTryVideo, topicFrame, type TryVideoDecoder } from './tryFrameMedia';
import {
  checkedTryScene,
  mergeTryFrameClasses,
  tryFrameAnnotations,
  tryFrameLabels,
  type TryFrameLabels,
} from './tryFramePlan';
import { selectTryFrames } from './tryFrameSelection';
import type { TryFrameJob, TryFramePick, TryFrameScene, TryFrameSource } from './tryFramesTypes';

export type TryFramesHeader = Omit<FrameSet, 'frames'> & { count: number };

interface FrameRequest extends TryFramePick {
  camera: string;
}

interface PreparedSource {
  source: TryFrameSource;
  scene?: TryFrameScene;
  labels?: TryFrameLabels;
  simulated: Set<string>;
}

interface SessionDependencies {
  load?: typeof loadCameraStage;
  render?: (request: CameraTrainingRequest) => Promise<CameraTrainingFrame>;
  video?: typeof openTryVideo;
}

const sameField = <T>(sources: TryFrameSource[], read: (stored: StoredTry) => T): T | null => {
  const values = new Set(sources.map((source) => read(source.stored)));

  return values.size === 1 ? [...values][0] : null;
};

function worldAppearance(source: TryFrameSource, scene: TryFrameScene, seconds: number) {
  const objects: Record<string, TrainingObjectVariation> = Object.create(null);

  for (const event of source.recording?.world ?? []) {
    if (event.at > seconds + 1e-9) continue;

    const named = scene.kase?.world.objects.find((object) => object.id === event.id);
    const name = named?.colors?.find((color) => color.color.toLowerCase() === event.color?.toLowerCase())?.name ?? '';

    objects[event.id] = {
      ...objects[event.id],
      ...(event.visible === undefined ? {} : { visible: event.visible }),
      ...(event.color ? { colors: [{ name, color: event.color }] } : {}),
    };
  }

  return Object.keys(objects).length ? { objects } : undefined;
}

async function prepareSource(source: TryFrameSource, job: TryFrameJob): Promise<PreparedSource> {
  const recorded = new Set([
    ...(source.stored.videos ?? []).map((video) => video.camera),
    ...compressedImageTopics(source).map((topic) => topic.topic),
  ]);
  const simulated = new Set(job.cameras.filter((camera) => !recorded.has(camera)));

  if (!simulated.size) return { source, simulated };

  const scene = await checkedTryScene(source, job.scene);

  if ([...simulated].some((key) => !scene.views.some((view) => view.key === key)))
    throw new Error('Choose a camera recorded with this try.');

  return { source, simulated, scene, labels: tryFrameLabels(scene) };
}

export class TryFramesSession {
  private readonly dependencies: SessionDependencies;
  private job: TryFrameJob | null = null;
  private sources: PreparedSource[] = [];
  private requests: FrameRequest[] = [];
  private cursor = 0;
  private loadedSource = -1;
  private readonly videos = new Map<string, TryVideoDecoder>();

  constructor(dependencies: SessionDependencies = {}) {
    this.dependencies = dependencies;
  }

  async load(job: TryFrameJob): Promise<TryFramesHeader> {
    this.close();

    if (
      !job.name.trim() ||
      job.name.length > 200 ||
      !job.cameras.length ||
      new Set(job.cameras).size !== job.cameras.length
    )
      throw new Error('Name the frame set and choose its cameras.');

    const picks = selectTryFrames(job.tries, job.selection);

    if (picks.length * job.cameras.length > 1000) throw new Error('Choose up to 1000 camera frames.');

    this.sources = await Promise.all(job.tries.map((source) => prepareSource(source, job)));

    const labels = this.sources.flatMap((source) => (source.labels ? [source.labels] : []));
    const classes = mergeTryFrameClasses(labels);

    for (const plan of labels)
      plan.classes = classes.filter((category) => plan.classes.some((c) => c.name === category.name));

    this.job = job;
    this.requests = picks.flatMap((pick) => job.cameras.map((camera) => ({ ...pick, camera })));

    return {
      version: 1,
      id: `frames-${crypto.randomUUID()}`,
      name: job.name,
      caseId: sameField(job.tries, (stored) => stored.case?.id ?? null),
      sceneId: sameField(job.tries, (stored) => stored.sceneId),
      seed: 0,
      classes,
      createdAt: new Date().toISOString(),
      count: this.requests.length,
    };
  }

  async next(): Promise<TrainingFrame> {
    const job = this.job;
    const request = this.requests[this.cursor];

    if (!job || !request) throw new Error('Choose frames from a saved try first.');

    const prepared = this.sources[request.tryIndex];
    const seed = seedOf(`try-frame:${prepared.source.stored.id}:${request.frame}:${request.camera}`);
    const raw = await this.capture(prepared, request, seed);
    const frame: Omit<TrainingFrame, 'id'> = {
      seed,
      camera: request.camera,
      ...raw,
      source: 'try',
      origin: { tryId: prepared.source.stored.id, frame: request.frame, seconds: request.seconds },
    };

    this.cursor++;

    return { ...frame, id: await frameHash(frame) };
  }

  private async capture(prepared: PreparedSource, request: FrameRequest, seed: number) {
    const { source, scene, labels } = prepared;
    const topic = compressedImageTopics(source).find((candidate) => candidate.topic === request.camera);

    if (topic) {
      const image = await topicFrame(topic, request.seconds);

      return { ...image, annotations: [], depth: new Float32Array(image.width * image.height) };
    }

    if (!prepared.simulated.has(request.camera)) return this.captureVideo(source, request);

    if (!scene || !labels || !source.recording || !this.job)
      throw new Error('Open the try’s scene before adding frames.');

    await this.loadScene(scene, request.tryIndex);

    const raw = await (this.dependencies.render ?? renderTrainingFrame)({
      poses: framePoses(source.recording, request.frame),
      key: request.camera,
      width: this.job.width ?? 640,
      height: this.job.height ?? 480,
      seed,
      keypoints: labels.keypoints,
      randomization: worldAppearance(source, scene, request.seconds),
    });

    return {
      jpeg: raw.jpeg,
      width: raw.width,
      height: raw.height,
      depth: raw.depth,
      annotations: tryFrameAnnotations(labels, raw),
    };
  }

  private async loadScene(scene: TryFrameScene, index: number) {
    if (this.loadedSource === index) return;

    if (!(await (this.dependencies.load ?? loadCameraStage)(scene))) throw new Error('Load the try’s scene again.');

    this.loadedSource = index;
  }

  private async decoder(source: TryFrameSource, camera: string): Promise<TryVideoDecoder> {
    const key = `${source.stored.id}\0${camera}`;
    const cached = this.videos.get(key);

    if (cached) return cached;

    const video = source.stored.videos?.find((candidate) => candidate.camera === camera);

    if (!video) throw new Error('Choose a camera recorded with this try.');

    const decoder = await (this.dependencies.video ?? openTryVideo)(source.stored, video);

    this.videos.set(key, decoder);

    return decoder;
  }

  private async captureVideo(source: TryFrameSource, request: FrameRequest) {
    const decoder = await this.decoder(source, request.camera);
    const image = await decoder.frame(request.seconds);

    return { ...image, annotations: [], depth: new Float32Array(image.width * image.height) };
  }

  close(): void {
    for (const decoder of this.videos.values()) decoder.close();

    this.videos.clear();
    this.job = null;
    this.sources = [];
    this.requests = [];
    this.cursor = 0;
    this.loadedSource = -1;
  }
}
