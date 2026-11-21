import { withoutWorldSources } from '../../cases/sourceParts';
import type { ViewportContext } from './viewportContext';
import type { ViewportProps } from './types';

export function syncSceneParts(ctx: ViewportContext, props: ViewportProps, meshVersion: number) {
  ctx.layer.sync(withoutWorldSources(props.parts, props.worldParts ?? []), new Set(props.selectedPartIds), meshVersion);
}
