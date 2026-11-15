import { registerSourced } from '../data/sourcedItems';
import { sourcedMeshFiles, type MeshFiles } from '../three/componentMeshes';
import type { StudyKnob, StudyScene } from './types';

const prepared = new WeakMap<StudyScene['parts'], WeakMap<StudyKnob[], Promise<MeshFiles>>>();

function preparedFiles(parts: StudyScene['parts'], knobs: StudyKnob[]): Promise<MeshFiles> {
  const byKnobs = prepared.get(parts) ?? new WeakMap<StudyKnob[], Promise<MeshFiles>>();
  const cached = byKnobs.get(knobs);

  if (cached) return cached;

  const targets = knobs.flatMap((knob) =>
    knob.kind === 'servo' || knob.kind === 'battery'
      ? knob.values.map((key) => ({ componentId: key.replace(/^component:/, '').split('|')[0] }))
      : [],
  );
  const loading = sourcedMeshFiles([...parts, ...targets]).catch((error: unknown) => {
    byKnobs.delete(knobs);

    throw error;
  });

  byKnobs.set(knobs, loading);
  prepared.set(parts, byKnobs);

  return loading;
}

export async function prepareStudyMeshes(scene: StudyScene, knobs: StudyKnob[]): Promise<StudyScene> {
  registerSourced(scene.project.sourced ?? []);

  const meshFiles = await preparedFiles(scene.parts, knobs);

  return { ...scene, meshFiles };
}
