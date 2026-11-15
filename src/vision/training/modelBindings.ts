import { validateVisionManifest, type VisionManifest } from '../manifest';
import type { VisionSource } from '../types';
import { idbAll, idbPut } from '../../utils/platform/web/idb';

export interface RetainedVisionTarget {
  scene: string;
  camera: string;
  node: string;
}

export interface RetainedVisionBinding extends RetainedVisionTarget {
  modelId: string;
}

interface StoredBinding extends RetainedVisionBinding {
  type: 'vision-binding';
  manifest?: VisionManifest;
}

const models = new Map<string, VisionManifest>();
const bindings = new Map<string, RetainedVisionBinding>();
const sources = new Map<string, VisionSource>();
const identity = (target: RetainedVisionTarget) => JSON.stringify([target.scene, target.camera, target.node]);

export function checkedVisionTarget(target: RetainedVisionTarget) {
  if (
    typeof target.scene !== 'string' ||
    !target.scene ||
    target.scene.length > 200 ||
    typeof target.camera !== 'string' ||
    !target.camera ||
    target.camera.length > 200 ||
    !['person-detection', 'object-detection'].includes(target.node)
  )
    throw new Error('Choose a scene camera and detection node.');

  return { scene: target.scene, camera: target.camera, node: target.node };
}

export const retainedVisionModel = (id: string) => models.get(id);
export const retainedVisionBindings = (scene: string) =>
  [...bindings.values()].filter((value) => value.scene === scene);
export const registerVisionModelSource = (source: VisionSource) => sources.set(source.id, source);
export const visionModelSource = (camera: string) => sources.get(camera.split('/')[0]);

export async function registerRetainedVisionModel(value: VisionManifest) {
  const manifest = validateVisionManifest(value);

  if (!('source' in manifest.model)) throw new Error('Choose a retained local model.');

  models.set(manifest.id, manifest);

  for (const saved of await idbAll<StoredBinding>('trained', 'vision-binding:')) {
    if (!saved || saved.type !== 'vision-binding' || saved.modelId !== manifest.id) continue;

    const target = checkedVisionTarget(saved);

    bindings.set(identity(target), { ...target, modelId: manifest.id });
  }

  return manifest;
}

export async function saveVisionBinding(binding: RetainedVisionBinding) {
  const manifest = models.get(binding.modelId);

  if (!manifest) throw new Error('Keep the trained model before applying it.');

  await idbPut('trained', `vision-binding:${identity(binding)}`, { ...binding, manifest, type: 'vision-binding' });
  bindings.set(identity(binding), binding);
}

export function boundVisionModel(node: string, camera: string, scene?: string) {
  return scene ? bindings.get(identity({ scene, camera, node }))?.modelId : undefined;
}

export async function restoreVisionBindings(scene: string) {
  for (const saved of await idbAll<StoredBinding>('trained', `vision-binding:[${JSON.stringify(scene)},`)) {
    if (!saved || saved.type !== 'vision-binding' || saved.scene !== scene || !saved.manifest) continue;

    const target = checkedVisionTarget(saved);
    const manifest = validateVisionManifest(saved.manifest);

    if (!('source' in manifest.model) || manifest.id !== saved.modelId)
      throw new Error('Choose a retained local model.');

    models.set(manifest.id, manifest);
    bindings.set(identity(target), { ...target, modelId: manifest.id });
  }

  return retainedVisionBindings(scene);
}
