import { normalizeHex } from '../design-system/colorMath';
import type { ScenePart } from '../types/robotics';

export interface Appearance {
  baseColor: string;
  roughness: number;
  metalness: number;
  opacity: number;
  textures?: Partial<Record<'baseColor' | 'normal' | 'roughnessMetalness', string>>;
  mapping: { kind: 'uv' | 'planar'; plane: 'xy' | 'xz' | 'yz'; scale: number; rotation: number };
  normalY: 1 | -1;
}

export const FINISHES = [
  { value: 'matte', label: 'Matte Polymer', roughness: 0.85, metalness: 0, opacity: 1 },
  { value: 'metal', label: 'Brushed Metal', roughness: 0.42, metalness: 1, opacity: 1 },
  { value: 'rubber', label: 'Rubber', roughness: 0.95, metalness: 0, opacity: 1 },
  { value: 'paint', label: 'Paint', roughness: 0.3, metalness: 0, opacity: 1 },
  { value: 'transparent', label: 'Transparent Cover', roughness: 0.15, metalness: 0, opacity: 0.3 },
] as const;

export function finishAppearance(finish: string, baseColor: string): Appearance {
  const values = FINISHES.find(({ value }) => value === finish) ?? FINISHES[0];

  return {
    baseColor: normalizeHex(baseColor) ?? '#e4e4e7',
    roughness: values.roughness,
    metalness: values.metalness,
    opacity: values.opacity,
    mapping: { kind: 'planar', plane: 'xy', scale: 10, rotation: 0 },
    normalY: 1,
  };
}

export function appearanceOf(part: ScenePart): Appearance {
  return part.appearance ?? { ...finishAppearance('paint', part.color), roughness: 0.38, metalness: 0.12 };
}

type AppearancePart = Pick<ScenePart, 'appearance' | 'boolean' | 'customNodes'>;

export function appearanceParts(parts: readonly AppearancePart[]): AppearancePart[] {
  const pending = [...parts];
  const result: AppearancePart[] = [];
  const seen = new Set<AppearancePart>();

  while (pending.length) {
    const part = pending.pop()!;

    if (!part || typeof part !== 'object' || seen.has(part)) continue;

    seen.add(part);
    result.push(part);

    const operands = Array.isArray(part.boolean?.operands) ? part.boolean.operands : [];
    const nodes = Array.isArray(part.customNodes) ? part.customNodes : [];

    pending.push(...operands, ...nodes.flatMap((node) => (node?.part ? [node.part] : [])));
  }

  return result;
}

export const textureHashes = (parts: readonly AppearancePart[]): string[] => [
  ...new Set(appearanceParts(parts).flatMap((part) => Object.values(part.appearance?.textures ?? {}))),
];

export type AppearanceEdit = Omit<Partial<Appearance>, 'mapping'> & { mapping?: Partial<Appearance['mapping']> };

export function editAppearance(part: ScenePart, patch: AppearanceEdit): Appearance {
  const base = appearanceOf(part);

  return {
    ...base,
    ...patch,
    mapping: { ...base.mapping, ...patch.mapping },
    textures: Object.fromEntries(
      Object.entries({ ...base.textures, ...patch.textures }).filter((entry) => typeof entry[1] === 'string'),
    ),
  };
}

export function applyFinish(part: ScenePart, finish: string): Partial<ScenePart> {
  if (!finish) return { appearance: undefined };

  const base = appearanceOf(part);
  const preset = finishAppearance(finish, base.baseColor);

  return { appearance: { ...base, roughness: preset.roughness, metalness: preset.metalness, opacity: preset.opacity } };
}
