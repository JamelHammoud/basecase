import { sceneAppearanceParts } from './sceneParts';
import { appearanceParts, type Appearance } from './model';
import type { ProjectSettings, ScenePart } from '../types/robotics';

const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
const unit = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
const bounded = (value: unknown, min: number, max: number) =>
  typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
const hash = (value: unknown) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);

function validMapping(mapping: Record<string, unknown>): boolean {
  return (
    typeof mapping.kind === 'string' &&
    ['uv', 'planar'].includes(mapping.kind) &&
    typeof mapping.plane === 'string' &&
    ['xy', 'xz', 'yz'].includes(mapping.plane) &&
    bounded(mapping.scale, 0.01, 100000) &&
    bounded(mapping.rotation, -360, 360)
  );
}

export function validAppearance(value: unknown): value is Appearance | undefined {
  if (value === undefined) return true;

  if (!object(value) || !object(value.mapping)) return false;

  const { mapping, textures } = value;
  const validTextures =
    textures === undefined ||
    (object(textures) &&
      Object.entries(textures).every(
        ([key, value]) => ['baseColor', 'normal', 'roughnessMetalness'].includes(key) && hash(value),
      ));

  return (
    typeof value.baseColor === 'string' &&
    /^#[a-f0-9]{6}$/i.test(value.baseColor) &&
    unit(value.roughness) &&
    unit(value.metalness) &&
    unit(value.opacity) &&
    validMapping(mapping) &&
    (value.normalY === 1 || value.normalY === -1) &&
    validTextures
  );
}

export const validPartAppearances = (parts: ScenePart[]): boolean =>
  appearanceParts(parts).every((part) => validAppearance(part.appearance));

export function validSceneAppearances(
  parts: ScenePart[],
  project?: Pick<ProjectSettings, 'study' | 'cases' | 'assignment'>,
): boolean {
  return validPartAppearances(sceneAppearanceParts(project, parts));
}
