import * as THREE from 'three';
import { box } from '../sim/fixtures/parts';
import type { ScenePart } from '../types/robotics';
import { TrainingPasses } from '../cameras/trainingPasses';
import { LensRenderer } from '../cameras/lensRender';
import { createStudioScene } from '../three/thumbnailStage';
import { renderDataset } from './buildDataset';
import { datasetFiles } from './lerobotExport';
import { placeCamera } from './cameras';
import { BACKGROUND, createRenderStage, floor, posed, renderView, videoCodec } from './renderVideos';
import type { RenderStage } from './renderVideos';
import { kitchenCameras, kitchenView, stationaryEpisode } from './worldRenderFixture';

function pixels(canvas: OffscreenCanvas): Uint8Array {
  const copy = new OffscreenCanvas(canvas.width, canvas.height).getContext('2d', { willReadFrequently: true })!;

  copy.drawImage(canvas, 0, 0);

  return new Uint8Array(copy.getImageData(0, 0, canvas.width, canvas.height).data.buffer);
}

async function digest(bytes: Uint8Array): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', new Uint8Array(bytes));

  return Array.from(new Uint8Array(hash), (value) => value.toString(16).padStart(2, '0')).join('');
}

function difference(a: Uint8Array, b: Uint8Array): number {
  let changed = 0;

  for (let i = 0; i < a.length; i += 4) {
    if (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) > 30) changed++;
  }

  return changed / (a.length / 4);
}

async function legacyFloor(world: ScenePart[]) {
  const renderer = new THREE.WebGLRenderer({
    canvas: new OffscreenCanvas(128, 96),
    antialias: true,
    preserveDrawingBuffer: true,
  });
  const scene = createStudioScene(renderer);
  const lens = new LensRenderer(renderer);
  const ground = floor();

  renderer.setPixelRatio(1);
  renderer.setSize(128, 96, false);
  renderer.setClearColor(BACKGROUND, 1);
  scene.add(ground, ...world.map((part) => posed(part).group));
  lens.render(scene, { ...placeCamera(kitchenCameras[0], undefined), lens: kitchenCameras[0].lens });

  const bytes = pixels(renderer.domElement as unknown as OffscreenCanvas);

  ground.geometry.dispose();
  (ground.material as THREE.Material).dispose();
  scene.environment?.dispose();
  lens.dispose();
  renderer.dispose();
  renderer.forceContextLoss();

  return bytes;
}

const world = [
  box('obstacle', [500, 300, 500], [300, 600, 300], 100),
  { ...box('hidden', [-500, 300, 500], [300, 600, 300], 100), visible: false },
];

let current: RenderStage | null = null;
let labels: TrainingPasses | null = null;
let imported: ReturnType<typeof kitchenView> | null = null;

const capture = () => (imported ??= kitchenView());

async function stageForCheck() {
  current ??= await createRenderStage([], world, undefined, { size: [128, 96] });

  return current;
}

async function reset() {
  const stage = await stageForCheck();

  stage.renderer.setSize(128, 96, false);
  stage.ground.visible = true;
  stage.world.forEach((part) => {
    part.group.visible = true;
  });
  await stage.captured.set(null);

  return stage;
}

export async function worldRenderPixels() {
  const stage = await reset();
  const before = await legacyFloor(world);
  const room = await capture();
  const camera = kitchenCameras[0];
  const canvas = stage.renderer.domElement as unknown as OffscreenCanvas;

  await renderView(stage, camera, undefined);

  const open = pixels(canvas);

  stage.ground.visible = false;
  await stage.captured.set(room);
  await renderView(stage, camera, undefined);

  const kitchen = pixels(canvas);
  const first = await digest(kitchen);

  await stage.captured.set(null);
  await stage.captured.set(room);
  await renderView(stage, camera, undefined);

  const repeated = await digest(pixels(canvas));

  await stage.captured.set(await kitchenView(false));
  await renderView(stage, camera, undefined);

  return {
    first,
    repeated,
    floorSame: (await digest(open)) === (await digest(before)),
    difference: difference(open, kitchen),
    meshDifference: difference(open, pixels(canvas)),
  };
}

export async function worldRenderFisheye() {
  const stage = await reset();
  const view = { ...kitchenCameras[0], lens: { model: 'fisheye' as const, fovDeg: 200 } };
  const canvas = stage.renderer.domElement as unknown as OffscreenCanvas;

  await renderView(stage, view, undefined);

  const open = pixels(canvas);

  stage.ground.visible = false;
  await stage.captured.set(await capture());
  await renderView(stage, view, undefined);

  return difference(open, pixels(canvas));
}

export async function worldRenderDepth() {
  const stage = await reset();
  const view = kitchenCameras[1];

  stage.ground.visible = false;
  await stage.captured.set(await capture());
  labels ??= new TrainingPasses(stage.renderer, stage.scene, stage.lens);

  const passes = labels;
  const frame = stage.captured.labels(() =>
    passes.capture({
      shot: { ...placeCamera(view, undefined), lens: view.lens },
      items: stage.world,
      width: 64,
      height: 48,
    }),
  );

  return frame.depth[24 * 64 + 32];
}

export async function worldRenderVideos() {
  const stage = await reset();
  const episode = stationaryEpisode();

  stage.renderer.setSize(640, 480, false);
  stage.ground.visible = false;
  stage.world.forEach((part) => {
    part.group.visible = false;
  });
  await stage.captured.set(await capture());

  return datasetFiles(
    await renderDataset(
      stage,
      {
        name: 'kitchen',
        robotType: 'fixture',
        parts: [],
        world: [],
        imported: await capture(),
        model: episode.model,
        cameras: kitchenCameras,
        episodes: [{ recording: episode.recording, task: '', source: {} }],
        source: {},
      },
      await videoCodec(),
    ),
  );
}

const checks = {
  init: async () => {
    await stageForCheck();

    return null;
  },
  pixels: worldRenderPixels,
  fisheye: worldRenderFisheye,
  depth: worldRenderDepth,
  videos: worldRenderVideos,
};

export const worldRenderChecks = (kind: keyof typeof checks) => checks[kind]();
