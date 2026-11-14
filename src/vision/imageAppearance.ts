import { Euler, Vector3, MathUtils } from 'three';
import type { CameraView } from '../cameras/views';
import { caseRandom } from '../cases/caseRandom';
import type { CaseImageDeclarations } from '../cases/imageDeclarations';
import type { Random } from '../skills/arenaWorld';
import type { V3 } from '../utils/kinematics';

export interface ImageSurface {
  color: string;
  texture?: 'plain' | 'checker' | 'stripes';
  scaleMm?: number;
}

export interface ImageAppearance {
  light: { direction: V3; color: string; intensity: number };
  floor: ImageSurface;
  wall: ImageSurface;
  wallPartIds: string[];
  noise: number;
}

const signed = (random: Random, amount: number) => (random() * 2 - 1) * amount;
const tuple = (v: Vector3): V3 => [v.x, v.y, v.z];
const choose = <T>(random: Random, values: readonly T[]): T => values[Math.floor(random() * values.length)];

function surface(random: Random): ImageSurface {
  return {
    color: choose(random, ['#c6c1b8', '#85837c', '#534d46', '#b0aaa2', '#d7d1c5']),
    texture: choose(random, ['plain', 'checker', 'stripes']),
    scaleMm: 40 + random() * 160,
  };
}

export function imageAppearance(seed: number, wallPartIds: string[]): ImageAppearance {
  const random = caseRandom(seed);
  const direction = tuple(new Vector3(signed(random, 1), 0.4 + random(), signed(random, 1)).normalize());

  return {
    light: { direction, color: choose(random, ['#fff2df', '#ffffff', '#e0ecff']), intensity: 0.65 + random() * 1.3 },
    floor: surface(random),
    wall: surface(random),
    wallPartIds,
    noise: 0.002 + random() * 0.018,
  };
}

export function imageCameraViews(
  views: CameraView[],
  seed: number,
  tolerance: CaseImageDeclarations['cameraTolerance'] = { mm: 0, deg: 0 },
): CameraView[] {
  const random = caseRandom(seed + 1_000_003);

  return views.map((view) => {
    const offset = new Vector3(
      signed(random, tolerance.mm),
      signed(random, tolerance.mm),
      signed(random, tolerance.mm),
    );
    const rotation = new Euler(...([0, 1, 2].map(() => MathUtils.degToRad(signed(random, tolerance.deg))) as V3));
    const position = new Vector3(...view.position).add(offset);
    const direction = new Vector3(...view.target).sub(new Vector3(...view.position)).applyEuler(rotation);
    const up = new Vector3(...view.up).applyEuler(rotation);

    return { ...view, position: tuple(position), target: tuple(position.clone().add(direction)), up: tuple(up) };
  });
}
