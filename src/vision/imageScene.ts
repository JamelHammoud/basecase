import { Vector3 } from 'three';
import type { CameraView } from '../cameras/views';
import { caseRandom, jitteredWorld, worldRandom } from '../cases/caseRandom';
import { worldItem, type Case, type WorldObject } from '../cases/schema';
import type { RobotJoint, ScenePart } from '../types/robotics';
import { partMatrix, type V3 } from '../utils/kinematics';
import { imageRobotPoints } from './imageRobotPoints';
import type { VisionClass } from './frameSet';
import { imageAppearance, imageCameraViews, type ImageAppearance } from './imageAppearance';

export type { ImageAppearance } from './imageAppearance';

export interface ImageInstance {
  id: number;
  partId: string;
  partIds?: string[];
  classId: number;
  keypoints: Record<string, V3>;
}

export interface ImageSceneInput {
  parts: ScenePart[];
  joints: RobotJoint[];
  kase?: Case | null;
  world?: ScenePart[];
  views: CameraView[];
  seed: number;
}

export interface ImageScene {
  parts: ScenePart[];
  world: ScenePart[];
  joints: RobotJoint[];
  views: CameraView[];
  classes: VisionClass[];
  instances: ImageInstance[];
  appearance: ImageAppearance;
}

type ClassInput = Pick<ImageSceneInput, 'parts' | 'kase' | 'world'> & { joints?: RobotJoint[] };

const solid = (p: ScenePart) => p.visible && p.role === 'solid';
const classKey = (kind: string, name: string) => `${kind}:${name}`;
const linkName = (part: ScenePart) => part.robotLink?.link ?? part.name;

export function imageClasses(input: ClassInput): VisionClass[] {
  const result = new Map<string, VisionClass>();
  const points = imageRobotPoints(input);
  const add = (kind: string, name: string, points: string[]) => {
    const key = classKey(kind, name);
    const prior = result.get(key);
    const keypoints = [...new Set([...(prior?.keypoints ?? []), ...points])].sort();

    result.set(key, { id: prior?.id ?? result.size + 1, name, kind, ...(keypoints.length ? { keypoints } : {}) });
  };

  for (const part of input.parts.filter(solid)) add('link', linkName(part), Object.keys(points.get(part.id) ?? {}));

  for (const object of input.kase?.world.objects ?? []) {
    const names = object.colors?.map((c) => c.name) ?? [object.name];

    for (const name of names) add(object.kind, name, Object.keys(object.points ?? {}));
  }

  for (const part of input.kase ? [] : (input.world ?? []).filter(solid)) add(part.kind, part.name, []);

  return [...result.values()];
}

function objectPoints(part: ScenePart, object?: WorldObject): Record<string, V3> {
  const matrix = partMatrix(part);

  return Object.fromEntries(
    Object.entries(object?.points ?? {}).map(([name, p]) => {
      const point = new Vector3(...p).applyMatrix4(matrix);

      return [name, [point.x, point.y, point.z] as V3];
    }),
  );
}

function sampledWorld(input: ImageSceneInput) {
  if (!input.kase)
    return {
      world: input.world ?? [],
      objects: new Map<string, WorldObject>(),
      selectedNames: new Map<string, string>(),
      distractors: new Set<string>(),
    };

  const randomDistractor = caseRandom(input.seed + 3_000_003);
  const distractors = (input.kase.images?.distractors ?? [])
    .filter(() => randomDistractor() > 0.35)
    .map((object) => ({
      ...object,
      ...(object.behavior === 'static' ? { jitter: object.jitter ?? { mm: 100, deg: 45 } } : {}),
    }));
  const primary = jitteredWorld(input.kase, worldRandom(input.seed));
  const extras = jitteredWorld({ ...input.kase, world: { objects: distractors } }, worldRandom(input.seed + 4_000_003));
  const sampled = [...primary.world.objects, ...extras.world.objects];
  const random = caseRandom(input.seed + 2_000_003);
  const objects = new Map(sampled.map((o) => [o.id, o]));
  const geometry = new Map((input.world ?? []).map((p) => [p.id, p]));
  const selectedNames = new Map<string, string>();
  const parts = sampled.map((object) => {
    const color = object.colors?.[Math.floor(random() * object.colors.length)];

    selectedNames.set(object.id, color?.name ?? object.name);

    return {
      ...worldItem(object),
      ...geometry.get(object.id),
      position: object.position,
      rotation: object.rotation,
      color: color?.color ?? object.color,
    };
  });

  return { world: parts, objects, selectedNames, distractors: new Set(distractors.map((d) => d.id)) };
}

function robotInstances(input: ImageSceneInput) {
  const points = imageRobotPoints(input);
  const links = new Map<
    string,
    { part: ScenePart; partIds: string[]; kind: string; name: string; keypoints: Record<string, V3> }
  >();

  for (const part of input.parts.filter(solid)) {
    const key = part.robotLink ? `${part.robotLink.robot}:${part.robotLink.link}` : part.id;
    const previous = links.get(key);

    links.set(key, {
      part: previous?.part ?? part,
      partIds: [...(previous?.partIds ?? []), part.id],
      kind: 'link',
      name: linkName(part),
      keypoints: { ...previous?.keypoints, ...points.get(part.id) },
    });
  }

  return [...links.values()];
}

function instancesFor(input: ImageSceneInput, world: ReturnType<typeof sampledWorld>, classes: VisionClass[]) {
  const byClass = new Map(classes.map((c) => [classKey(c.kind, c.name), c.id]));
  const robot = robotInstances(input);
  const objects = world.world
    .filter((part) => solid(part) && !world.distractors.has(part.id))
    .map((part) => {
      const object = world.objects.get(part.id);
      const name = world.selectedNames.get(part.id) ?? part.name;

      return { part, partIds: [part.id], kind: object?.kind ?? part.kind, name, keypoints: objectPoints(part, object) };
    });

  return [...robot, ...objects].map(({ part, partIds, kind, name, keypoints }, index) => ({
    id: index + 1,
    partId: part.id,
    partIds,
    classId: byClass.get(classKey(kind, name))!,
    keypoints,
  }));
}

export function resolveImageScene(input: ImageSceneInput): ImageScene {
  if (!Number.isSafeInteger(input.seed)) throw new Error('Image seed must be a safe integer');

  const sampled = sampledWorld(input);
  const classes = imageClasses(input);
  const wallPartIds = sampled.world.filter((p) => /\bwall\b/i.test(p.name)).map((p) => p.id);

  return {
    parts: input.parts,
    world: sampled.world,
    joints: input.joints,
    views: imageCameraViews(input.views, input.seed, input.kase?.images?.cameraTolerance),
    classes,
    instances: instancesFor(input, sampled, classes),
    appearance: imageAppearance(input.seed, wallPartIds),
  };
}
