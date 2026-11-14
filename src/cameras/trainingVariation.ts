import * as THREE from 'three';
import type { Posed } from '../datasets/renderVideos';
import type { V3 } from '../utils/kinematics';
import { seeded } from '../utils/seeded';
import { clampLens } from './lens';
import { trainingInstances } from './trainingLabels';
import { TrainingSurfaces } from './trainingSurfaces';
import type { LensShot } from './lensRender';
import type { TrainingObjectVariation, TrainingRandomization } from './trainingTypes';

type Random = () => number;

type Restore = () => void;

const signed = (random: Random, amount = 0) => (random() * 2 - 1) * amount;
const vector = (random: Random, amount = 0) =>
  new THREE.Vector3(signed(random, amount), signed(random, amount), signed(random, amount));
const rotation = (values: V3) => new THREE.Euler(...(values.map(THREE.MathUtils.degToRad) as V3));

interface SurfaceVariation {
  random: Random;
  options: TrainingRandomization;
  color?: string;
  restores: Restore[];
}

function varySurface(mesh: THREE.Mesh, variation: SurfaceVariation): void {
  const { random, options, color, restores } = variation;
  const original = mesh.material;
  const materials = Array.isArray(original) ? original : [original];
  const varied = materials.map((material) => {
    const clone = material.clone();

    if (!(clone instanceof THREE.MeshStandardMaterial) && !(clone instanceof THREE.MeshBasicMaterial)) return clone;

    if (color) clone.color.set(color);

    if (options.colors)
      clone.color.offsetHSL(signed(random, options.colors * 0.03), 0, signed(random, options.colors * 0.1));

    return clone;
  });

  mesh.material = Array.isArray(original) ? varied : varied[0];
  restores.push(() => {
    mesh.material = original;
    varied.forEach((material) => material.dispose());
  });
}

function placeItem(item: Posed, options: TrainingObjectVariation, random: Random) {
  const group = item.group;
  const rest = new THREE.Matrix4().compose(item.position, item.quaternion, group.scale);
  const current = group.matrix.clone();
  const sim = current.clone().multiply(rest.clone().invert());
  const position = new THREE.Vector3(...(options.position ?? (item.position.toArray() as V3)));
  const quaternion = options.rotation
    ? new THREE.Quaternion().setFromEuler(rotation(options.rotation))
    : item.quaternion.clone();
  const next = new THREE.Matrix4().compose(position, quaternion, group.scale);

  next.premultiply(sim).decompose(group.position, group.quaternion, group.scale);
  group.position.add(vector(random, options.mm));
  group.quaternion.premultiply(
    new THREE.Quaternion().setFromEuler(rotation(vector(random, options.deg).toArray() as V3)),
  );
  group.visible = options.visible ?? group.visible;
  group.updateMatrixWorld(true);

  return group.matrix.clone().multiply(rest.invert());
}

interface SceneVariation {
  scene: THREE.Scene;
  items: Posed[];
  seed: number;
  randomization?: TrainingRandomization;
  surfaces?: THREE.Object3D[];
  surfacePool?: TrainingSurfaces;
}

function varyLight(light: THREE.Light, random: Random, amount: number, restores: Restore[]) {
  const intensity = light.intensity;
  const position = light.position.clone();
  const color = light.color.clone();
  const warmth = signed(random, amount * 0.2);

  light.color.multiply(new THREE.Color().setRGB(1 + warmth, 1 + signed(random, amount * 0.04), 1 - warmth));

  light.intensity *= 1 + signed(random, amount * 0.5);
  light.position.add(vector(random, amount * 100));
  restores.push(() => {
    light.intensity = intensity;
    light.position.copy(position);
    light.color.copy(color);
  });
}

function varySurfaces(job: SceneVariation, random: Random, restores: Restore[]): void {
  const amount = job.randomization?.textures;

  if (!amount) return;

  const pool = job.surfacePool ?? new TrainingSurfaces();

  if (!job.surfacePool) restores.push(() => pool.dispose());

  for (const root of job.surfaces ?? []) restores.push(pool.apply(root, random, amount));
}

export function varyTrainingScene(job: SceneVariation) {
  const random = seeded(job.seed);
  const options = job.randomization ?? {};
  const restores: Restore[] = [];
  const deltas = new Map<string, THREE.Matrix4>();
  const variants: Record<string, string> = Object.create(null);

  const byId = new Map(job.items.map((item) => [item.id, item]));

  for (const { instance } of trainingInstances(job.items)) {
    const item = byId.get(instance)!;
    const object = options.objects?.[item.id] ?? {};
    const matrix = item.group.matrix.clone();
    const visible = item.group.visible;
    const selected = object.colors?.[Math.floor(random() * object.colors.length)];

    if (selected) variants[item.id] = selected.name;

    deltas.set(item.id, placeItem(item, object, random));
    item.group.traverse((child) => {
      if (!(child instanceof THREE.Mesh) || !(selected || options.colors)) return;

      varySurface(child, { random, options, color: selected?.color, restores });
    });
    restores.push(() => {
      matrix.decompose(item.group.position, item.group.quaternion, item.group.scale);
      item.group.visible = visible;
      item.group.updateMatrixWorld(true);
    });
  }

  varySurfaces(job, random, restores);

  job.scene.traverse((child) => {
    if (child instanceof THREE.Light && options.lighting) varyLight(child, random, options.lighting, restores);
  });

  return { deltas, variants, restore: () => restores.reverse().forEach((restore) => restore()) };
}

export function varyTrainingShot(shot: LensShot, seed: number, options: TrainingRandomization = {}): LensShot {
  const random = seeded(seed ^ 0x71a5c4);
  const offset = vector(random, options.cameraPositionMm);
  const position = new THREE.Vector3(...shot.position).add(offset);
  const direction = new THREE.Vector3(...shot.target).sub(new THREE.Vector3(...shot.position));
  const turn = new THREE.Quaternion().setFromEuler(rotation(vector(random, options.cameraRotationDeg).toArray() as V3));
  const lensDelta = signed(random, options.lensDeg);
  const lens =
    shot.lens.model === 'pinhole'
      ? { model: 'pinhole' as const, hfovDeg: shot.lens.hfovDeg + lensDelta }
      : { model: 'fisheye' as const, fovDeg: shot.lens.fovDeg + lensDelta };

  return {
    position: position.toArray() as V3,
    target: direction.applyQuaternion(turn).add(position).toArray() as V3,
    up: new THREE.Vector3(...shot.up).applyQuaternion(turn).toArray() as V3,
    lens: clampLens(lens),
  };
}
