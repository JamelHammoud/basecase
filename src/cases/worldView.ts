import type { ImportedWorldView } from '../three/viewport/importedWorld';
import type { Case } from './schema';
import { getWorldAsset } from './worldAssets';

export function caseWorldView(kase: Case | null | undefined): ImportedWorldView | null {
  const reference = kase?.world.imported;
  const asset = reference && getWorldAsset(reference.hash);

  return reference && asset ? { ...reference, asset } : null;
}
