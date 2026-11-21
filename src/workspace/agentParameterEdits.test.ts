import { expect, it, vi } from 'vitest';
import { specToPart } from '../agent/agentScene';
import { booleanPart } from '../booleans/parts';
import { surfaceOperands } from '../booleans/operands';
import type { WorkspaceCore } from './useWorkspaceCore';
import { parameterEditor } from './agentParameterEdits';

it('claims boolean parents, operands and mate targets before changing their shared dimensions', async () => {
  const base = {
    ...specToPart({ id: 'base', shape: 'box' }),
    dimensionBindings: [{ kind: 'primitive' as const, target: 'width', unit: 'mm' as const, expression: 'width' }],
  };
  const tool = specToPart({ id: 'tool', shape: 'box' });
  const root = booleanPart({ id: 'root', base, tools: [tool], op: 'subtract' });
  const target = specToPart({ id: 'target', shape: 'box' });
  const mated = { ...root, mates: [{ port: 'face', target: target.id, targetPort: 'face', type: 'face' as const }] };
  const unrelated = specToPart({ id: 'unrelated', shape: 'box' });
  const parts = [mated, target, unrelated];
  const apply = vi.fn(async () => true);
  const core = { docs: { partsRef: { current: parts } }, parameters: { apply } } as unknown as WorkspaceCore;
  const guard = vi.fn((id: string) => (id === 'target' ? 'Claimed by another edit' : null));
  const touch = vi.fn();
  const edit = parameterEditor({ core, guard, touch, current: () => true });

  await expect(edit([{ op: 'set', parameter: { name: 'width', unit: 'mm', value: 80 } }])).rejects.toThrow(
    'Claimed by another edit',
  );
  expect(apply).not.toHaveBeenCalled();
  guard.mockImplementation(() => null);
  touch.mockClear();
  expect(await edit([{ op: 'set', parameter: { name: 'width', unit: 'mm', value: 80 } }])).toBe(true);
  expect(touch.mock.calls.map(([part]) => part.id)).toEqual(
    surfaceOperands(parts)
      .filter((part) => part.id !== 'unrelated')
      .map((part) => part.id),
  );
});
