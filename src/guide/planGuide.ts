import { buildPartGroup, releasePartGroup } from '../three/buildPartMesh';
import { provideMeshFiles, type MeshFiles } from '../three/componentMeshes';
import { loadPartMeshes } from '../three/thumbnailRender';
import type { ProjectSettings, ScenePart } from '../types/robotics';
import type { AssemblyGeometry } from '../assembly/assemblyGeometry';
import { provenOrderOf } from '../assembly/provenOrder';
import { buildGuidePlan } from './guidePlan';
import { GuideCache } from './render/guideCache';
import { measureGuideScene, type GuideObjects } from './render/guideMeasure';

export interface PlanGuideJob {
  title: string;
  parts: ScenePart[];
  project: ProjectSettings;
  geometry: AssemblyGeometry;
  meshes?: MeshFiles;
}

export async function planGuide(job: PlanGuideJob) {
  provideMeshFiles(job.meshes);
  await loadPartMeshes(job.parts);

  const groups = new Map(job.parts.map((part) => [part.id, buildPartGroup(part, false, { shareGeometry: true })]));
  const objects: GuideObjects = {
    ids: () => [...groups.keys()],
    group: (id) => groups.get(id),
    showAll: () => groups.forEach((group) => group.updateMatrixWorld(true)),
  };
  const cache = new GuideCache();

  cache.begin(Object.fromEntries(job.parts.map((part) => [part.id, part.id])));

  try {
    const measured = await measureGuideScene(objects, { cache, isCancelled: () => false });

    return buildGuidePlan(
      {
        title: job.title,
        boardPartId: job.project.electronicsBoard?.partId,
        parts: job.parts,
        joints: job.project.joints ?? [],
        ...measured,
        order: provenOrderOf(job.parts, job.geometry),
      },
      job.project.material,
    );
  } finally {
    groups.forEach(releasePartGroup);
  }
}
