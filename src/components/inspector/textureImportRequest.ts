import type { ScenePart } from '../../types/robotics';

export interface TextureImportRequest {
  parts: ScenePart[];
  sceneParts: ScenePart[];
  baselineParts?: ScenePart[];
}

const sameRecords = (a: ScenePart[] = [], b: ScenePart[] = []) =>
  a === b || (a.length === b.length && a.every((part, index) => part === b[index]));

export const sameTextureRequest = (a: TextureImportRequest | null, b: TextureImportRequest) =>
  !!a &&
  sameRecords(a.parts, b.parts) &&
  sameRecords(a.sceneParts, b.sceneParts) &&
  sameRecords(a.baselineParts, b.baselineParts);
