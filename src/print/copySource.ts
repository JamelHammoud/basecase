import { physicalParts } from '../appearance/physical';
import type { ScenePart } from '../types/robotics';
import { sha256Hex } from '../skills/hash';

const presentation = new Set([
  'id',
  'name',
  'category',
  'color',
  'opacity',
  'note',
  'visible',
  'locked',
  'position',
  'rotation',
  'print',
  'printMaterial',
  'massG',
  'com',
  'annotations',
]);

export function copySourceKeys(
  parts: ScenePart[],
  geometry: Record<string, { positions: ArrayLike<number>; indices: ArrayLike<number> }> = {},
): Record<string, string> {
  return Object.fromEntries(
    physicalParts(parts).map((part) => {
      const source = Object.fromEntries(Object.entries(part).filter(([key]) => !presentation.has(key)));
      const bytes = new TextEncoder().encode(
        JSON.stringify({ source, geometry: geometry[part.id] }, (_key, value: unknown) => {
          if (ArrayBuffer.isView(value)) return Array.from(value as unknown as ArrayLike<number>);

          if (!value || typeof value !== 'object' || Array.isArray(value)) return value;

          const fields = value as Record<string, unknown>;

          return Object.fromEntries(
            Object.keys(fields)
              .sort()
              .map((key) => [key, fields[key]]),
          );
        }),
      );

      return [part.id, sha256Hex(bytes)];
    }),
  );
}
