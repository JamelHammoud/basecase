import type { ScenePart } from '../types/robotics';
import type { FrozenKit } from './frozenKit';

export function frozenViewParts(kit: FrozenKit): ScenePart[] {
  return kit.parts
    .filter((part) => part.role === 'solid')
    .map((part) => {
      const geometry = kit.geometry[part.id];

      if (!geometry?.positions.length || !geometry.indices.length) throw new Error('The build geometry is missing.');

      return {
        ...part,
        kind: 'mesh',
        componentId: undefined,
        componentVariant: undefined,
        cad: undefined,
        sculptMesh: undefined,
        customNodes: undefined,
        boolean: undefined,
        deformers: undefined,
        sheetTransform: undefined,
        mesh: {
          ...geometry,
          baseSize: [part.dimensions.width, part.dimensions.height, part.dimensions.depth],
        },
      };
    });
}
