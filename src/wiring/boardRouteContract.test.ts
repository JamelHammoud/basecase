import { expect, it } from 'vitest';
import { checkedRoutePlan, routeStackup, checkedSession } from './boardRouteContract.mjs';

const fabrication = {
  source: 'https://example.com/process',
  clearanceMm: 0.2,
  trackWidthMm: 0.25,
  drillMm: 0.3,
};
const plan = {
  source: 'https://example.com/design',
  trackWidthMm: 0.4,
  clearanceMm: 0.25,
  viaDiameterMm: 0.8,
  viaDrillMm: 0.4,
  copperMm: 0.035,
  dielectricMaterial: 'FR4',
  epsilonR: 4.5,
  lossTangent: 0.02,
  special: '',
};

it('requires routing declarations independently of process minimums and retains declared stackup values', () => {
  expect(() => checkedRoutePlan(undefined, fabrication)).toThrow('board-route-requirements');
  expect(checkedRoutePlan(plan, fabrication)).toEqual(plan);
  expect(routeStackup(plan, 1.6)).toContain('(thickness 1.53)');
  expect(routeStackup(plan, 1.6)).toContain('(material "FR4")');
  expect(() => routeStackup({ ...plan, copperMm: 0.5 }, 0.5)).toThrow('board-route-requirements');
});

it.each([
  { ...plan, trackWidthMm: 0.2 },
  { ...plan, clearanceMm: 0.1 },
  { ...plan, viaDrillMm: 0.2 },
  { ...plan, viaDiameterMm: 0.3 },
  { ...plan, source: '' },
  { ...plan, copperMm: null },
  { ...plan, epsilonR: Number.NaN },
  { ...plan, special: 'controlled impedance' },
  { ...plan, special: 'differential pair' },
  { ...plan, special: 'other' },
  { ...plan, command: 'download' },
])('refuses undeclared, unsupported or incompatible requirements', (value) => {
  expect(() => checkedRoutePlan(value, fabrication)).toThrow();
});

it('does not substitute missing fabrication evidence with routing declarations', () => {
  expect(() => checkedRoutePlan(plan, { ...fabrication, source: '' })).toThrow('board-manufacturing');
});

it('bounds and restricts session data before native SES import', () => {
  const session = '(session robot (base_design robot) (placement) (was_is) (routes (resolution um 10) (network_out)))';

  expect(checkedSession(session)).toBe(session);

  const fractional = session.replace('(network_out)', '(network_out (net n (via "Via[0-1]_800.2:400.1_um" 100 200)))');

  expect(checkedSession(fractional)).toBe(fractional);

  const point = session.replace('(network_out)', '(network_out (net n (wire (path F.Cu 2500 10 20))))');

  expect(checkedSession(point)).toBe(point);

  for (const source of [
    '(session robot (file "../../private"))',
    '(session robot (routes (model "https://example.com/part")))',
    '(session robot (routes (resolution um 0)))',
    '(session robot (routes (resolution mm 10)))',
    '(session robot (routes (network_out (net x (wire (path F.Cu NaN 1 2 3 4))))))',
    '(session robot (routes (network_out (net x (wire (path In1.Cu 100 1 2 3 4))))))',
    '(session robot (routes (network_out (net x (wire (path F.Cu 100 1 2 3))))))',
    '(session robot (routes (network_out (net x (via "../file" 1 2))))))',
    '('.repeat(60),
    ' '.repeat(8 * 1024 * 1024 + 1),
  ])
    expect(() => checkedSession(source)).toThrow();
});
