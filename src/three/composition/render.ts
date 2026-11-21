import * as THREE from 'three';
import { textureHashes } from '../../appearance/model';
import { assertTextureBudget } from '../../appearance/textureAsset';
import { worldImagePixels } from '../../cases/worldImport/image';
import { textureResources } from '../../appearance/textures';
import { provideMeshFiles, type RenderMeshFiles } from '../componentMeshes';
import { withPreparedParts } from '../thumbnailRender';
import { createStudioScene } from '../thumbnailStage';
import { snapshot } from '../viewport/captures';
import { imageHandlers } from '../../utils/imageOps';
import type { ViewShot } from '../viewport/types';
import {
  compositionCamera,
  compositionParts,
  compositionRoot,
  frameComposition,
  releaseComposition,
  type CompositionSnapshot,
} from './scene';
import { validComposition, type CompositionSettings } from './settings';

export interface CompositionJob {
  snapshot: CompositionSnapshot;
  settings: CompositionSettings;
  meshes: RenderMeshFiles;
  frame?: boolean;
}

export interface CompositionOutput {
  png: Blob;
  view: ViewShot;
  metrics: {
    preparationMs: number;
    renderMs: number;
    encodingMs: number;
    geometries: number;
    textures: number;
    decodedPixels: number;
    outputBytes: number;
    pixelBytes: number;
    drawCalls: number;
    dispatchMs?: number;
    totalMs?: number;
  };
}

export interface CompositionStage {
  canvas: OffscreenCanvas;
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
}

const lightSources = new WeakMap<THREE.Light, { intensity: number; position: THREE.Vector3 }>();

function lightSource(light: THREE.Light) {
  const saved = lightSources.get(light);

  if (saved) return saved;

  const source = { intensity: light.intensity, position: light.position.clone() };

  lightSources.set(light, source);

  return source;
}

export function createCompositionStage(): CompositionStage {
  const canvas = new OffscreenCanvas(64, 64);
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: false });

  renderer.setPixelRatio(1);

  return { canvas, renderer, scene: createStudioScene(renderer) };
}

export function disposeCompositionStage(stage: CompositionStage): void {
  stage.scene.environment?.dispose();
  stage.renderer.dispose();
  stage.renderer.forceContextLoss();
}

export function lightComposition(
  scene: THREE.Scene,
  renderer: THREE.WebGLRenderer,
  settings: CompositionSettings,
): void {
  const rotation = THREE.MathUtils.degToRad(settings.rotation);

  scene.environmentRotation.y = rotation;
  scene.environmentIntensity = 0.55 * settings.lighting;
  scene.background = settings.transparent ? null : new THREE.Color(settings.background);
  renderer.setClearColor(0, settings.transparent ? 0 : 1);
  renderer.toneMappingExposure = settings.exposure;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  for (const object of scene.children) {
    if (!(object instanceof THREE.Light)) continue;

    const source = lightSource(object);

    object.intensity = source.intensity * settings.lighting;
    object.position.copy(source.position).applyAxisAngle(new THREE.Vector3(0, 1, 0), rotation);
  }
}

function requireInputs(job: CompositionJob): void {
  if (!validComposition(job.settings))
    throw new Error('Choose image sides from 64 to 4096 pixels, within 8,388,608 total pixels.');

  const missing = textureHashes(compositionParts(job.snapshot.parts)).some((hash) => !job.meshes[`texture:${hash}`]);

  if (missing) throw new Error('Replace missing textures in Appearance before rendering.');

  if (!compositionParts(job.snapshot.parts).length) throw new Error('Show a solid part before rendering.');

  for (const matrix of Object.values(job.snapshot.pose)) {
    if (matrix.length !== 16 || !matrix.every(Number.isFinite))
      throw new Error('Choose a finite pose before rendering.');
  }
}

export async function renderCompositionJob(job: CompositionJob, stage?: CompositionStage): Promise<CompositionOutput> {
  requireInputs(job);

  const start = performance.now();

  await requireTextureBudget(job);
  provideMeshFiles(job.meshes);

  return withPreparedParts(compositionParts(job.snapshot.parts), async () => {
    const root = compositionRoot(job.snapshot);

    try {
      return await drawComposition(job, root, start, stage);
    } finally {
      releaseComposition(root);
    }
  });
}

async function requireTextureBudget(job: CompositionJob): Promise<void> {
  const blobs = textureHashes(compositionParts(job.snapshot.parts)).map((hash) => job.meshes[`texture:${hash}`]);
  const bytes = blobs.reduce((sum, blob) => sum + (blob instanceof Blob ? blob.size : blob.byteLength), 0);

  assertTextureBudget(bytes, 0);

  const images = await Promise.all(
    blobs.map(async (blob) => new Uint8Array(blob instanceof Blob ? await blob.arrayBuffer() : blob)),
  );
  const pixels = images.reduce((sum, bytes) => sum + worldImagePixels(bytes), 0);

  assertTextureBudget(bytes, pixels);
}

async function drawComposition(
  job: CompositionJob,
  root: THREE.Group,
  start: number,
  provided?: CompositionStage,
): Promise<CompositionOutput> {
  const { settings } = job;
  const view = job.frame ? frameComposition(root, settings) : settings.view;
  const camera = compositionCamera({ ...settings, view });
  const stage = provided ?? createCompositionStage();
  const { canvas, renderer, scene } = stage;

  renderer.setSize(settings.width, settings.height, false);
  lightComposition(scene, renderer, settings);
  scene.add(root);

  try {
    const prepared = performance.now();

    renderer.render(scene, camera);

    const bitmap = snapshot(canvas);
    const rendered = performance.now();
    const { result: png } = await imageHandlers.encode({ bitmap, type: 'image/png' });
    const resources = textureResources();

    return {
      png,
      view,
      metrics: {
        preparationMs: prepared - start,
        renderMs: rendered - prepared,
        encodingMs: performance.now() - rendered,
        geometries: renderer.info.memory.geometries,
        textures: renderer.info.memory.textures,
        decodedPixels: resources.pixels,
        outputBytes: png.size,
        pixelBytes: settings.width * settings.height * 12,
        drawCalls: renderer.info.render.calls,
      },
    };
  } finally {
    scene.remove(root);

    if (!provided) disposeCompositionStage(stage);
  }
}
