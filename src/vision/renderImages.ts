import { annotationsForRaster } from '../cameras/labelPixels';
import { projectedKeypoints } from '../cameras/labelPoints';
import { LiveStage } from '../cameras/liveStage';
import type { MeshFiles } from '../three/componentMeshes';
import { hashFrame, type VisionFrame } from './frameSet';
import { resolveImageScene, type ImageSceneInput } from './imageScene';
import { imageClassPlan } from './makeImagesPlan';

export interface RenderImageJob extends ImageSceneInput {
  camera: string;
  classes?: string[];
}

export class ImageRenderer {
  private readonly stage: LiveStage;

  readonly width: number;

  readonly height: number;

  constructor(width = 640, height = 480) {
    this.width = width;
    this.height = height;
    this.stage = new LiveStage([width, height]);
  }

  async frame(job: RenderImageJob, meshes?: MeshFiles): Promise<VisionFrame> {
    const scene = resolveImageScene(job);
    const included = new Set(imageClassPlan(scene.classes, job.classes).map((kind) => kind.id));
    const instances = scene.instances.filter((instance) => included.has(instance.classId));

    await this.stage.setScene(scene.parts, scene.world, meshes);
    this.stage.setViews(scene.views);

    const result = await this.stage.trainingFrame({
      key: job.camera,
      instances,
      appearance: scene.appearance,
      seed: job.seed,
    });
    const projection = {
      shot: result.camera,
      width: this.width,
      height: this.height,
      depth: result.depth,
      instances,
    };
    const annotations = annotationsForRaster({
      raster: result.raster,
      width: this.width,
      height: this.height,
      instances,
      keypoints: projectedKeypoints(projection),
    });
    const content = {
      width: this.width,
      height: this.height,
      image: result.image,
      depth: result.depth,
      annotations,
      camera: result.camera,
      seed: job.seed,
    };

    return { ...content, id: hashFrame(content) };
  }

  dispose(): void {
    this.stage.dispose();
  }
}
