import { availableVisionCameras, configureVisionCamera, loadVisionManifest } from '../../cameras/visionSession';
import type { VisionKind, VisionManifest } from '../manifest';
import { ROUTINE_VISION_MODELS } from '../../routines/vision';
import {
  checkedVisionTarget,
  boundVisionModel,
  retainedVisionBindings,
  retainedVisionModel,
  restoreVisionBindings,
  saveVisionBinding,
  visionModelSource,
  type RetainedVisionTarget,
} from './modelBindings';

export { registerRetainedVisionModel } from './modelBindings';
export type { RetainedVisionTarget } from './modelBindings';

export function retainedVisionTargets(
  scene: string,
  cameras: Array<{ id: string; name: string }>,
  options: { kind?: VisionKind; classes?: string[] } = {},
) {
  const nodes = [
    { id: 'object-detection', name: 'See Objects' },
    { id: 'person-detection', name: 'See Person' },
  ];

  return cameras.flatMap((camera) =>
    nodes
      .filter((node) => node.id !== 'person-detection' || !options.classes || options.classes.includes('person'))
      .map((node) => ({
        id: `${camera.id}:${node.id}`,
        name: `${camera.name}: ${node.name}`,
        target: { scene, camera: camera.id, node: node.id },
      })),
  );
}

export async function applyRetainedVisionModel(
  value: VisionManifest,
  requested: RetainedVisionTarget,
  current: () => boolean = () => true,
) {
  const target = checkedVisionTarget(requested);
  const manifest = retainedVisionModel(value.id);

  if (!manifest || manifest.model.sha256 !== value.model.sha256)
    throw new Error('Keep the trained model before applying it.');

  if (!['detect', 'segment', 'keypoints', 'classify'].includes(manifest.kind))
    throw new Error('Choose an image model for this node.');

  if (target.node === 'person-detection' && !manifest.classes.includes('person'))
    throw new Error('Choose a model with a person class for See Person.');

  await loadVisionManifest(manifest);

  if (!current()) return false;

  const previous = boundVisionModel(target.node, target.camera, target.scene) ?? ROUTINE_VISION_MODELS[target.node];

  await saveVisionBinding({ ...target, modelId: manifest.id });

  if (!current()) return false;

  const cameras = availableVisionCameras().filter((camera) => {
    const source = visionModelSource(camera);

    return source?.scene === target.scene && camera.slice(camera.indexOf('/') + 1) === target.camera;
  });

  const shared = retainedVisionBindings(target.scene).some(
    (binding) => binding.camera === target.camera && binding.modelId === previous,
  );

  await Promise.all(
    cameras.map((camera) =>
      configureVisionCamera(camera, { modelId: manifest.id, replaceModelId: shared ? undefined : previous }),
    ),
  );

  return true;
}

export async function restoreRetainedCameraModels(
  source: import('../types').VisionSource,
  cameras: string[],
  current: () => boolean,
) {
  const restored = await restoreVisionBindings(source.scene);

  if (!current()) return;

  for (const binding of restored) {
    if (!current()) return;

    if (!cameras.includes(binding.camera)) continue;

    await configureVisionCamera(`${source.id}/${binding.camera}`, {
      modelId: binding.modelId,
      continuous: false,
      replaceModelId: ROUTINE_VISION_MODELS[binding.node],
    });
  }
}
