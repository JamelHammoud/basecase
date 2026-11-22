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

it('keeps overflow with recovery between repair pull requests while main is red', () => {
  const dependencies = { held: () => true, pulls: () => [], check: () => ({ conclusion: 'failure' }) };

  expect(repairOverflowHold('build', dependencies)).toContain('main');
  expect(repairOverflowHold('refine', dependencies)).toContain('main');
});

it.each(['success', null])('releases the recovery reservation after a %s main verdict', (conclusion) => {
  const dependencies = { held: () => true, pulls: () => [], check: () => conclusion && { conclusion } };

  expect(repairOverflowHold('build', dependencies)).toBeNull();
});

it('does not query the main verdict when a repair already reserves overflow', () => {
  const dependencies = { held: () => true, pulls: () => [repair], check: vi.fn() };

  expect(repairOverflowHold('build', dependencies)).toContain('repair #12');
  expect(dependencies.check).not.toHaveBeenCalled();
});
