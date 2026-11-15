import { sha256 } from '../cases/tries';
import type { CameraTrainingFrame, TrainingPoint } from '../cameras/trainingTypes';
import type { ImageAnnotation, ImageClass } from './frameSet';
import { annotationFromInstances } from './imageMasks';
import { trainingPlan } from './trainingPlan';
import type { TryFrameScene, TryFrameSource } from './tryFramesTypes';

export interface TryFrameLabels {
  classes: ImageClass[];
  names: Record<string, string[]>;
  keypoints: TrainingPoint[];
}

export async function checkedTryScene(source: TryFrameSource, fallback?: TryFrameScene): Promise<TryFrameScene> {
  const scene = source.scene ?? fallback;
  const recording = source.recording;

  if (!scene?.model || !recording) throw new Error('Open the try’s scene before adding frames.');

  if ((await sha256(scene.model.xml)) !== source.stored.robot.modelHash)
    throw new Error('The scene’s model has changed since this try was recorded.');

  if (
    recording.nbody !== scene.model.bodies.length ||
    recording.poses.length !== recording.frames * recording.nbody * 7
  )
    throw new Error('Load the try’s recorded body poses again.');

  return scene;
}

export function tryFrameLabels(scene: TryFrameScene): TryFrameLabels {
  if (scene.kase) {
    const plan = trainingPlan({
      ...scene,
      kase: scene.kase,
      sceneId: '',
      count: 1,
      cameras: scene.views.map((view) => view.key),
      classes: [],
      seed: 0,
    });

    return {
      ...plan,
      classes: plan.classes.map((category) => ({
        ...category,
        ...objectIdentity(scene.world, category.name),
      })),
    };
  }

  const items = [...scene.parts, ...scene.world].filter((part) => part.visible && part.role === 'solid');
  const names = Object.fromEntries(items.map((part) => [part.id, [part.name]]));
  const unique = [...new Set(items.map((part) => part.name))].sort();

  return {
    classes: unique.map((name, id) => ({ id, name, ...objectIdentity(scene.world, name) })),
    names,
    keypoints: [],
  };
}

function objectIdentity(objects: { id: string; name: string }[], name: string) {
  const matches = objects.filter((object) => object.name === name);

  return matches.length === 1 ? { objectId: matches[0].id } : {};
}

function mergedIdentity(plans: TryFrameLabels[], name: string) {
  const classes = plans.flatMap((plan) => plan.classes.filter((category) => category.name === name));
  const ids = new Set(classes.map((category) => category.objectId));
  const id = [...ids][0];

  return ids.size === 1 && id ? { objectId: id } : {};
}

export function mergeTryFrameClasses(plans: TryFrameLabels[]): ImageClass[] {
  const names = [...new Set(plans.flatMap((plan) => plan.classes.map((category) => category.name)))].sort();

  return names.map((name, id) => ({
    id,
    name,
    ...mergedIdentity(plans, name),
    keypoints: [
      ...new Set(
        plans.flatMap((plan) => plan.classes.filter((c) => c.name === name).flatMap((c) => c.keypoints ?? [])),
      ),
    ].sort(),
  }));
}

export function tryFrameAnnotations(plan: TryFrameLabels, raw: CameraTrainingFrame): ImageAnnotation[] {
  return raw.instances.flatMap(({ id, instance }) => {
    const names = [raw.variants[instance], ...(plan.names[instance] ?? [])];
    const category = names.map((name) => plan.classes.find((c) => c.name === name)).find(Boolean);

    if (!category) return [];

    const keypoints = raw.keypoints
      .filter((point) => point.instance === instance)
      .map(({ name, x, y, visible }) => ({ name, x, y, visible }));
    const annotation = annotationFromInstances({ ...raw, instanceId: id, instance, classId: category.id, keypoints });

    return annotation ? [annotation] : [];
  });
}
