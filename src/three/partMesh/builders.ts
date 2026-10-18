import { BLOCKOUT_BUILDERS } from './blockouts';
import { customModelBuilder, sculptFallback, type GroupBuilder } from './customModel';
import { IMPORTED_BUILDERS } from './importedMeshes';
import { PRIMITIVE_BUILDERS, type PartBuilder } from './primitives';

export function partBuilders(build: GroupBuilder): Record<string, PartBuilder> {
  return {
    ...PRIMITIVE_BUILDERS,
    ...BLOCKOUT_BUILDERS,
    ...IMPORTED_BUILDERS,
    custom_model: customModelBuilder(build),
    sculpt_mesh: sculptFallback,
  };
}
