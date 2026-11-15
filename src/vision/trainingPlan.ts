import type { ImportedWorldView } from '../three/viewport/importedWorld';
import { Vector3 } from 'three';
import { jitteredWorld, worldRandom } from '../cases/caseRandom';
import { worldItem, type Case, type WorldObject } from '../cases/schema';
import type { CameraStageJob } from '../cameras/cameraStage';
import type { CameraTrainingRequest, TrainingPoint, TrainingObjectVariation } from '../cameras/trainingTypes';
import type { CameraView } from '../cameras/views';
import { seedOf } from '../datasets/datasetFile';
import type { SimModel } from '../sim/mjcfTypes';
import type { ScenePart } from '../types/robotics';
import { partMatrix, type Rig, type V3 } from '../utils/kinematics';
import type { ImageClass } from './frameSet';

export interface TrainingImagesJob {
  parts: ScenePart[];
  rig?: Rig;
  world?: ScenePart[];
  model: SimModel | null;
  imported?: ImportedWorldView | null;
  views: CameraView[];
  kase: Case;
  sceneId: string;
  count: number;
  cameras: string[];
  classes: string[];
  seed: number;
}

export interface TrainingPlan extends CameraStageJob {
  kase: Case;
  sceneId: string;
  count: number;
  seed: number;
  classes: ImageClass[];
  names: Record<string, string[]>;
  keypoints: TrainingPoint[];
}

const compare = (a: string, b: string) => (a < b ? -1 : Number(a > b));
const objectsOf = (kase: Case) => [...kase.world.objects, ...(kase.imageRandomization?.distractors ?? [])];

function robotClass(part: ScenePart, rig?: Rig): string {
  const owner = rig?.ownerOf.get(part.id);

  return (owner && rig?.byId.get(owner)?.name) || part.name;
}

function worldPoints(objects: WorldObject[]): TrainingPoint[] {
  return objects.flatMap((o) => {
    const matrix = partMatrix(worldItem(o));

    return Object.entries(o.points ?? {}).map(([name, local]) => ({
      instance: o.id,
      name,
      position: new Vector3(...local).applyMatrix4(matrix).toArray() as V3,
    }));
  });
}

function jointPoints(parts: ScenePart[], rig?: Rig): TrainingPoint[] {
  const ids = new Set(parts.map((p) => p.id));

  return (rig?.joints ?? []).flatMap((joint) => {
    const instance = [joint.frame?.part, ...joint.child, ...joint.parent].find((id) => id && ids.has(id));

    return instance ? [{ instance, name: joint.name, position: joint.origin }] : [];
  });
}

const worldNames = (o: WorldObject): string[] => [...(o.colors ?? []).map((c) => c.name), o.name, o.kind];

function namesOf(parts: ScenePart[], kase: Case, rig?: Rig): Record<string, string[]> {
  return Object.fromEntries([
    ...parts.map((p) => [p.id, [robotClass(p, rig)]]),
    ...objectsOf(kase).map((o) => [o.id, worldNames(o)]),
  ]);
}

export function trainingImageClasses(parts: ScenePart[], kase: Case, rig?: Rig): ImageClass[] {
  const names = namesOf(parts, kase, rig);
  const points = [...worldPoints(objectsOf(kase)), ...jointPoints(parts, rig)];
  const classes = [...new Set(Object.values(names).flat())].sort(compare);

  return classes.map((name, id) => ({
    id,
    name,
    keypoints: [...new Set(points.filter((p) => names[p.instance]?.includes(name)).map((p) => p.name))].sort(compare),
  }));
}

function selectedViews(job: TrainingImagesJob): CameraView[] {
  const cameras = new Set(job.cameras);
  const views = job.views.filter((view) => cameras.has(view.key));

  if (!views.length || cameras.size !== views.length) throw new Error('Choose cameras from this Case.');

  return views;
}

export function trainingPlan(job: TrainingImagesJob): TrainingPlan {
  if (!Number.isInteger(job.count) || job.count < 1 || job.count > 1000)
    throw new Error('Choose from 1 to 1000 images.');

  if (!Number.isInteger(job.seed) || job.seed < 0 || job.seed > 0xffffffff)
    throw new Error('Choose a whole seed from 0 to 4294967295.');

  const parts = job.parts.filter((p) => p.visible && p.role === 'solid');
  const available = trainingImageClasses(parts, job.kase, job.rig);
  const wanted = new Set(job.classes);
  const classes = wanted.size ? available.filter((c) => wanted.has(c.name)) : available;

  if (!classes.length || (wanted.size && wanted.size !== classes.length))
    throw new Error('Choose classes from this Case.');

  const ids = [...parts.map((p) => p.id), ...objectsOf(job.kase).map((o) => o.id)];

  if (new Set(ids).size !== ids.length) throw new Error('Give each robot part and world object a different id.');

  return {
    parts,
    ...(job.imported ? { imported: job.imported } : {}),
    world: objectsOf(job.kase).map((o) => job.world?.find((p) => p.id === o.id) ?? worldItem(o)),
    views: selectedViews(job),
    model: job.model,
    kase: job.kase,
    sceneId: job.sceneId,
    count: job.count,
    seed: job.seed,
    classes,
    names: Object.fromEntries([
      ...parts.map((p) => [p.id, [robotClass(p, job.rig)]]),
      ...objectsOf(job.kase).map((o) => [o.id, [o.name, o.kind]]),
    ]),
    keypoints: [...worldPoints(objectsOf(job.kase)), ...jointPoints(parts, job.rig)],
  };
}

export function classForInstance(
  plan: TrainingPlan,
  instance: string,
  variants: Record<string, string>,
): ImageClass | null {
  const names = plan.names[instance] ?? [];
  const candidates = [variants[instance], ...names];

  return candidates.map((name) => plan.classes.find((c) => c.name === name)).find(Boolean) ?? null;
}

function imageObjects(plan: TrainingPlan, seed: number): Record<string, TrainingObjectVariation> {
  const random = worldRandom(seed);
  const kase = jitteredWorld(plan.kase, random);
  const distractors = plan.kase.imageRandomization?.distractors ?? [];
  const extras = jitteredWorld({ ...plan.kase, world: { objects: distractors } }, random).world.objects;

  return Object.fromEntries([
    ...kase.world.objects.map((o) => [o.id, { position: o.position, rotation: o.rotation, colors: o.colors }]),
    ...extras.map((o) => [
      o.id,
      { position: o.position, rotation: o.rotation, colors: o.colors, visible: random() >= 0.5 },
    ]),
  ]);
}

export function requestForImage(plan: TrainingPlan, index: number): CameraTrainingRequest {
  if (!Number.isInteger(index) || index < 0 || index >= plan.count)
    throw new Error('Choose an image in this frame set.');

  const seed = seedOf(`training-image:${plan.seed}:${index}`);
  const tolerance = plan.kase.imageRandomization?.cameraTolerance;

  return {
    poses: null,
    key: plan.views[index % plan.views.length].key,
    width: 640,
    height: 480,
    seed,
    keypoints: plan.keypoints,
    randomization: {
      lighting: 1,
      textures: 1,
      objects: imageObjects(plan, seed),
      cameraPositionMm: tolerance?.mm ?? 0,
      cameraRotationDeg: tolerance?.deg ?? 0,
      noise: 0.002,
    },
  };
}
