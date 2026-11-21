import { expect, it } from 'vitest';
import { specToPart } from '../../agent/agentScene';
import { layerRows } from './layerRows';
import { layerRange, layerSlots, selectedRowIndex } from './layerWindow';

it('preserves complete list height, source identities and rename drafts across large scroll and resize ranges', () => {
  const parts = Array.from({ length: 1000 }, (_, index) => specToPart({ id: `part-${index}`, shape: 'box' }));
  const rows = layerRows(parts, new Set());

  const cases = [0, 1, 12, 1000].flatMap((count) =>
    [0, 100, 33000, 1e9].flatMap((top) => [0, 100, 720].map((height) => ({ count, top, height }))),
  );

  for (const { count, top, height } of cases) {
    const input = rows.slice(0, count);
    const slots = layerSlots(input, layerRange(count, top, height), 'part-999');
    const mounted = slots.filter((slot) => slot.type === 'row');
    const total = slots.reduce((sum, slot) => sum + (slot.type === 'space' ? slot.height : 32), 0);

    expect(total + Math.max(0, slots.length - 1)).toBe(Math.max(0, count * 33 - 1));
    expect(mounted.length).toBeLessThanOrEqual(Math.ceil(height / 33) + 15);

    for (const slot of mounted) expect(input).toContain(slot.row);

    if (count === 1000) expect(mounted.some((slot) => slot.key === 'part:part-999')).toBe(true);
  }
});

it('reveals selected operands and collapsed groups through the same displayed ancestor without changing the model', () => {
  const leaf = specToPart({ id: 'leaf', shape: 'box' });
  const boolean = {
    ...specToPart({ id: 'boolean', shape: 'box' }),
    kind: 'boolean' as const,
    boolean: { op: 'subtract' as const, operands: [leaf] },
  };
  const group = { id: 'group', name: 'Arm' };
  const parts = [specToPart({ id: 'base', shape: 'box' }), { ...boolean, group }];

  expect(selectedRowIndex(layerRows(parts, new Set()), parts, 'leaf')).toBe(3);
  expect(selectedRowIndex(layerRows(parts, new Set(['boolean'])), parts, 'leaf')).toBe(2);
  expect(selectedRowIndex(layerRows(parts, new Set(['group'])), parts, 'leaf')).toBe(1);
  expect(selectedRowIndex(layerRows(parts, new Set(), 'base'), parts, 'leaf')).toBe(-1);
  expect(parts[1].boolean?.operands[0]).toBe(leaf);
});
