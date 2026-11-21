import { expect, it } from 'vitest';
import { so101 } from '../wiring/fixtures';
import { wiringNetlist } from '../wiring/netlist';
import { currentWiring } from './currentWiring';
import { readinessOf, withDecisions } from './readiness';

it('keeps measured cable choices through decisions and drops them when the scene changes', () => {
  const scene = so101();
  const wiring = wiringNetlist(scene);
  const measured = readinessOf([], {
    parts: scene.parts,
    fingerprint: 'before',
    wiring,
    now: new Date('2026-11-15T12:00:00Z'),
  });
  const current = withDecisions(measured, scene.parts, { ignoredRules: {} });

  expect(current.checkedAt).toBe(measured.checkedAt);
  expect(currentWiring({ current, fingerprint: 'before' })).toBe(wiring);
  expect(currentWiring({ current, fingerprint: 'after' })).toBeUndefined();
  expect(currentWiring({ current: null, fingerprint: 'before' })).toBeUndefined();
});
