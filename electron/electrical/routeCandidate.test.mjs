import { expect, it, vi } from 'vitest';
import { danglingRouteItems, nativeRouteCandidate } from './routeCandidate.mjs';

const native = vi.hoisted(() => ({ validate: vi.fn() }));

vi.mock('./validate.mjs', () => ({ runNativeBoard: native.validate }));

const id = '01234567-89ab-cdef-0123-456789abcdef';
const report = {
  kicad_version: '9.0.6',
  unconnected_items: [],
  schematic_parity: [],
  violations: [{ type: 'track_dangling', severity: 'warning', items: [{ uuid: id }] }],
};
const result = (value = report) => ({ version: '9.0.6', issues: ['board-drc'], report: JSON.stringify(value) });

it('normalizes only native-identified dangling warnings on a connected source and leaves fabrication to final validation', async () => {
  native.validate.mockResolvedValue(result());

  const normalize = vi.fn(async () => 'normalized');
  const request = { pcb: 'original', boardHash: 'old' };

  expect(await nativeRouteCandidate({ request, pcb: 'candidate', normalize })).toBe('normalized');
  expect(normalize).toHaveBeenCalledExactlyOnceWith([id]);
  expect(native.validate.mock.calls[0][0]).toMatchObject({ pcb: 'candidate' });
  expect(native.validate.mock.calls[0][0].boardHash).toMatch(/^[a-f0-9]{64}$/u);
  expect(native.validate.mock.calls[0][1].exportFabrication).toBe(false);
  expect(request).toEqual({ pcb: 'original', boardHash: 'old' });
});

it.each([
  { ...report, unconnected_items: [{}] },
  { ...report, schematic_parity: [{}] },
  { ...report, violations: [{ type: 'shorting_items', severity: 'error', items: [{ uuid: id }] }] },
  { ...report, violations: [{ type: 'clearance', severity: 'error', items: [{ uuid: id }] }] },
  { ...report, violations: [{ type: 'track_dangling', severity: 'error', items: [{ uuid: id }] }] },
  { ...report, violations: [{ type: 'track_dangling', severity: 'warning', items: [{ uuid: '../secret' }] }] },
  { ...report, violations: [] },
  { ...report, violations: Array.from({ length: 4097 }, () => report.violations[0]) },
])('refuses faults and unsupported native output without editing copper', (value) => {
  expect(() => danglingRouteItems(result(value))).toThrow('board-drc');
});

it('keeps a clean candidate intact without calling cleanup', async () => {
  native.validate.mockResolvedValue({
    version: '9.0.6',
    issues: [],
    report: JSON.stringify({ ...report, violations: [] }),
  });

  const normalize = vi.fn();

  expect(await nativeRouteCandidate({ request: {}, pcb: 'clean', normalize })).toBe('clean');
  expect(normalize).not.toHaveBeenCalled();
  expect(() => danglingRouteItems({ version: '9.0.5', issues: [] })).toThrow('board-validator');
  expect(() => danglingRouteItems({ version: '9.0.6', issues: ['board-unrouted'] })).toThrow('board-unrouted');
});
