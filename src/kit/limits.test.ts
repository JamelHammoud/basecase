import { expect, it } from 'vitest';
import { box } from '../sim/fixtures/parts';
import type { CustomModelSubNode, ScenePart } from '../types/robotics';
import { checkKitSource, KIT_MAX_BYTES } from './limits';

const meshOfSize = (values: number) => ({ positions: { length: values }, indices: [] }) as never;
const part = () => box('source', [0, 0, 0], [10, 10, 10], 1);

it('accepts the geometry budget boundary and refuses an additional retained sculpt value', () => {
  const source = { ...part(), mesh: meshOfSize(KIT_MAX_BYTES / 8) };

  expect(() => checkKitSource([source])).not.toThrow();
  expect(() => checkKitSource([{ ...source, sculptMesh: meshOfSize(1) }])).toThrow('256 MB');
});

it('counts retained CAD, imported mesh, sculpt and CAD edge data together', () => {
  const source = {
    ...part(),
    cad: { positions: { length: KIT_MAX_BYTES / 32 }, indices: [], edges: { length: 1 } } as never,
    mesh: meshOfSize(KIT_MAX_BYTES / 32),
    sculptMesh: meshOfSize(KIT_MAX_BYTES / 16),
  };

  expect(() => checkKitSource([source])).toThrow('256 MB');
});

it.each(['boolean', 'custom sculpt', 'custom part', 'contour', 'lathe'] as const)(
  'counts geometry nested in a %s',
  (kind) => {
    const child = { ...part(), sculptMesh: meshOfSize(KIT_MAX_BYTES / 8 + 1) };
    const node: CustomModelSubNode = {
      id: 'node',
      name: 'Node',
      nodeType: 'sculpt_mesh' as const,
      role: child.role,
      position: child.position,
      rotation: child.rotation,
      dimensions: child.dimensions,
      color: child.color,
    };

    if (kind === 'custom part') node.part = child;

    if (kind === 'custom sculpt') node.sculptMesh = child.sculptMesh;

    if (kind === 'contour')
      node.contour = {
        outerLoop: { length: KIT_MAX_BYTES / 32 } as never,
        holes: [{ length: KIT_MAX_BYTES / 32 + 1 } as never],
      };

    if (kind === 'lathe') node.lathe = { profilePoints: { length: KIT_MAX_BYTES / 16 + 1 } as never };

    const source: ScenePart =
      kind === 'boolean'
        ? { ...part(), boolean: { op: 'union', operands: [child] } }
        : { ...part(), customNodes: [node] };

    expect(() => checkKitSource([source])).toThrow('256 MB');
  },
);
