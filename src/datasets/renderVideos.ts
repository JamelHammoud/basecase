import * as THREE from 'three';
import { QUALITY_HIGH, VideoSample, type VideoCodec } from 'mediabunny';
import { buildPartGroup, releasePartGroup } from '../three/buildPartMesh';
import { provideMeshFiles, type MeshFiles } from '../three/componentMeshes';
import { loadPartMeshes } from '../three/thumbnailRender';
import { createStudioScene } from '../three/thumbnailStage';
import { simDeltas, worldDeltas } from '../sim/mjcfFrames';
import type { SimModel } from '../sim/mjcfTypes';
import { framePoses, type Recording } from '../sim/recorder';
import type { ScenePart } from '../types/robotics';
import { LensRenderer, type Viewport } from '../cameras/lensRender';
import { FRAME_HEIGHT, FRAME_WIDTH, placeCamera, type DatasetCamera } from './cameras';
import { DATASET_FPS, type FeatureStats } from './episodes';
import { encodableCodec, mp4Writer } from '../utils/mp4Writer';

export const BACKGROUND = 0x262626;

const FLOOR = 0x7a7a7a;
const STATS_EVERY = 5;
const STATS_W = 32;
const STATS_H = 24;

const CODEC_NAMES: Record<string, string> = { avc: 'h264', vp9: 'vp9', av1: 'av1', hevc: 'hevc', vp8: 'vp8' };

export interface Posed {
  id: string;
  group: THREE.Group;
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
}

export interface RenderStage {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  lens: LensRenderer;
  parts: Posed[];
  world: Posed[];
  probe: OffscreenCanvasRenderingContext2D;
}

export interface EpisodeVideos {
  videos: Record<string, Uint8Array>;
  imageStats: Record<string, FeatureStats>;
}

export const posed = (part: ScenePart): Posed => {
  const group = buildPartGroup(part, false, { shareGeometry: true });

  return { id: part.id, group, position: group.position.clone(), quaternion: group.quaternion.clone() };
};

export function floor(): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(40000, 40000),
    new THREE.MeshStandardMaterial({ color: FLOOR, roughness: 0.95 }),
  );

  mesh.rotation.x = -Math.PI / 2;

  return mesh;
}

export async function createRenderStage(
  parts: ScenePart[],
  world: ScenePart[],
  meshes?: MeshFiles,
  [width, height]: [number, number] = [FRAME_WIDTH, FRAME_HEIGHT],
) {
  provideMeshFiles(meshes);
  await loadPartMeshes([...parts, ...world]);

  const renderer = new THREE.WebGLRenderer({
    canvas: new OffscreenCanvas(width, height),
    antialias: true,
    preserveDrawingBuffer: true,
  });

  renderer.setPixelRatio(1);
  renderer.setSize(width, height, false);

  const scene = createStudioScene(renderer);
  const stage: RenderStage = {
    renderer,
    scene,
    lens: new LensRenderer(renderer),
    parts: parts.map(posed),
    world: world.map(posed),
    probe: new OffscreenCanvas(STATS_W, STATS_H).getContext('2d', { willReadFrequently: true })!,
  };

  renderer.setClearColor(BACKGROUND, 1);
  scene.add(floor(), ...stage.parts.map((p) => p.group), ...stage.world.map((p) => p.group));

  return stage;
}

export function disposeRenderStage(stage: RenderStage) {
  [...stage.parts, ...stage.world].forEach((p) => releasePartGroup(p.group));
  stage.lens.dispose();
  stage.renderer.dispose();
}

const scratch = new THREE.Matrix4();
const scale = new THREE.Vector3();

export function applyDeltas(items: Posed[], deltas: Map<string, THREE.Matrix4>) {
  for (const item of items) {
    const delta = deltas.get(item.id);

    scratch.compose(item.position, item.quaternion, new THREE.Vector3(1, 1, 1));

    if (delta) scratch.premultiply(delta);

    scratch.decompose(item.group.position, item.group.quaternion, scale);
    item.group.updateMatrixWorld(true);
  }
}

export function renderView(
  stage: RenderStage,
  camera: DatasetCamera,
  delta: THREE.Matrix4 | undefined,
  viewport?: Viewport,
) {
  stage.lens.render(stage.scene, { ...placeCamera(camera, delta), lens: camera.lens }, viewport);
}

class ChannelStats {
  private readonly min = [Infinity, Infinity, Infinity];

  private readonly max = [-Infinity, -Infinity, -Infinity];

  private readonly sum = [0, 0, 0];

  private readonly squares = [0, 0, 0];

  private count = 0;

  add(probe: OffscreenCanvasRenderingContext2D, source: OffscreenCanvas) {
    probe.drawImage(source, 0, 0, STATS_W, STATS_H);

    const { data } = probe.getImageData(0, 0, STATS_W, STATS_H);

    for (let i = 0; i < data.length; i += 4) {
      for (let c = 0; c < 3; c++) {
        const v = data[i + c] / 255;

        this.min[c] = Math.min(this.min[c], v);
        this.max[c] = Math.max(this.max[c], v);
        this.sum[c] += v;
        this.squares[c] += v * v;
      }
    }

    this.count += data.length / 4;
  }

  done(frames: number): FeatureStats {
    const mean = this.sum.map((s) => s / Math.max(1, this.count));

    return {
      min: this.min,
      max: this.max,
      mean,
      std: this.squares.map((s, c) => Math.sqrt(Math.max(0, s / Math.max(1, this.count) - mean[c] ** 2))),
      count: [frames],
    };
  }
}

export async function videoCodec(): Promise<VideoCodec> {
  const codec = await encodableCodec({ width: FRAME_WIDTH, height: FRAME_HEIGHT });

  if (!codec) throw new Error('This computer can’t encode video.');

  return codec;
}

export const codecName = (codec: VideoCodec) => CODEC_NAMES[codec] ?? codec;

function cameraTrack(camera: DatasetCamera, codec: VideoCodec) {
  const writer = mp4Writer({ codec, quality: QUALITY_HIGH, keyFrameInterval: 1, frameRate: DATASET_FPS });

  return { camera, writer, stats: new ChannelStats() };
}

export interface EpisodeRender {
  model: SimModel;
  recording: Recording;
  frames: number[];
  cameras: DatasetCamera[];
  codec: VideoCodec;
}

export async function renderEpisode(stage: RenderStage, job: EpisodeRender): Promise<EpisodeVideos> {
  const tracks = job.cameras.map((c) => cameraTrack(c, job.codec));
  const canvas = stage.renderer.domElement as unknown as OffscreenCanvas;

  await Promise.all(tracks.map((t) => t.writer.start()));

  for (const [row, frame] of job.frames.entries()) {
    const poses = framePoses(job.recording, frame);
    const deltas = simDeltas(job.model, poses);

    applyDeltas(stage.parts, deltas);
    applyDeltas(stage.world, worldDeltas(job.model, poses));

    for (const track of tracks) {
      renderView(stage, track.camera, track.camera.part ? deltas.get(track.camera.part) : undefined);

      if (row % STATS_EVERY === 0) track.stats.add(stage.probe, canvas);

      const sample = new VideoSample(canvas, { timestamp: row / DATASET_FPS, duration: 1 / DATASET_FPS });

      await track.writer.add(sample);
      sample.close();
    }
  }

  const videos = await Promise.all(tracks.map(async (t) => [t.camera.key, await t.writer.finish()] as const));

  return {
    videos: Object.fromEntries(videos),
    imageStats: Object.fromEntries(tracks.map((t) => [t.camera.key, t.stats.done(job.frames.length)])),
  };
}
