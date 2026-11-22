import { expect, it, vi } from 'vitest';
import { repairOverflowHold } from './overflowPriority.mjs';

const repair = { number: 12, labels: [{ name: 'loop:repair' }] };

it('reserves protected overflow for a pending repair before admitting producers', () => {
  const dependencies = { held: () => true, pulls: () => [repair] };

  expect(repairOverflowHold('build', dependencies)).toContain('repair #12');
  expect(repairOverflowHold('refine', dependencies)).toContain('repair #12');
});

it('leaves repair and review drains eligible without querying pulls', () => {
  const dependencies = { held: vi.fn(), pulls: vi.fn() };

  for (const lane of ['review', 'revise', 'repair', 'doctor', 'merge', 'web', 'ci']) {
    expect(repairOverflowHold(lane, dependencies)).toBeNull();
  }

  expect(dependencies.held).not.toHaveBeenCalled();
  expect(dependencies.pulls).not.toHaveBeenCalled();
});

it('does not reserve overflow when the primary provider is available', () => {
  const dependencies = { held: () => false, pulls: vi.fn() };

  expect(repairOverflowHold('build', dependencies)).toBeNull();
  expect(dependencies.pulls).not.toHaveBeenCalled();
});

it('admits producers again when the last repair closes', () => {
  const dependencies = { held: () => true, pulls: () => [{ number: 13, labels: [{ name: 'loop:feature' }] }] };

  expect(repairOverflowHold('build', dependencies)).toBeNull();
});
