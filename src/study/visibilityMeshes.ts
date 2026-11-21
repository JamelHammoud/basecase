import { COMPONENT_BY_ID } from '../data/components';
import { componentMeshUrl, renderMeshFiles, type RenderMeshFiles } from '../three/componentMeshes';
import type { ScenePart } from '../types/robotics';

const files = new WeakMap<ScenePart[], Promise<RenderMeshFiles>>();

export function visibilityMeshFiles(parts: ScenePart[]): Promise<RenderMeshFiles> {
  const kept = files.get(parts);

  if (kept) return kept;

  const ids = [
    ...new Set(
      parts.flatMap((part) =>
        part.componentId && Object.hasOwn(COMPONENT_BY_ID, part.componentId) ? [part.componentId] : [],
      ),
    ),
  ];
  const loading = Promise.all([
    renderMeshFiles(parts),
    Promise.all(
      ids.map(async (id) => {
        const response = await fetch(componentMeshUrl(id));

        if (!response.ok) throw new Error('Load the catalog meshes before comparing camera views.');

        return [id, await response.arrayBuffer()] as const;
      }),
    ),
  ])
    .then(([sourced, catalog]) => ({ ...sourced, ...Object.fromEntries(catalog) }))
    .catch((error: unknown) => {
      files.delete(parts);

      throw error;
    });

  files.set(parts, loading);

  return loading;
}
