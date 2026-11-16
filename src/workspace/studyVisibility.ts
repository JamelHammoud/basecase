import { loadManifests, loadRecordingBytes } from '../cases/tryStore';
import { sceneWorldAssets } from '../cases/worldAssets';
import { visibilityMeshFiles } from '../study/visibilityMeshes';
import { buildTryScene } from '../vision/trySceneClient';
import { createVisibilitySession } from '../study/visibilityClient';
import type { StudyVisibilityRequest } from '../study/visibilityPlan';
import type { StudyScene } from '../study/types';

export async function loadStudyVisibility(input: {
  request: StudyVisibilityRequest;
  base: StudyScene;
  candidates: number;
  sceneId?: string;
  caseId?: string;
  signal?: AbortSignal;
}) {
  const { request, base, candidates, sceneId, caseId, signal } = input;

  signal?.throwIfAborted();

  const [stored] = await loadManifests([request.tryId]);

  if (!stored || (sceneId && stored.sceneId !== sceneId)) throw new Error('Choose a saved try from this scene.');

  if (stored.case?.id !== caseId) throw new Error('Choose a try from the selected Case.');

  const bytes = await loadRecordingBytes(request.tryId);

  if (!bytes) throw new Error('Restore the saved try before comparing camera views.');

  const triangles = Object.values(base.triangles).reduce((sum, value) => sum + value.length / 9, 0);

  if (base.parts.length > 256 || triangles > 1000000)
    throw new Error('Compare at most 256 parts and 1000000 robot triangles.');

  const meshes = await visibilityMeshFiles(base.parts);
  const scene = await buildTryScene({
    scene: base,
    stored,
    partners: [],
    meshes,
    assets: sceneWorldAssets(base.project),
  });

  signal?.throwIfAborted();

  const session = createVisibilitySession();
  let closed = false;
  const dispose = () => {
    if (closed) return;

    closed = true;
    signal?.removeEventListener('abort', dispose);
    session.dispose();
  };

  signal?.addEventListener('abort', dispose, { once: true });

  try {
    const key = await session.load({ scene: { ...scene, meshes }, stored, bytes, request, candidates });

    signal?.throwIfAborted();

    return { ...session, key, dispose };
  } catch (error) {
    dispose();

    throw error;
  }
}
