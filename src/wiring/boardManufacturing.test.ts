import { expect, it } from 'vitest';
import { completeBoardRules, connectedBoardReport, explicitBoardStackup } from './boardNativeContract.mjs';

const pcb =
  '(kicad_pcb (general (thickness 1.6)) (setup (stackup (layer "F.Cu" (type "copper") (thickness 0.035)) (layer "dielectric 1" (type "core") (thickness 1.53) (material "FR4") (epsilon_r 4.5) (loss_tangent 0.02)) (layer "B.Cu" (type "copper") (thickness 0.035)))))';

it('requires positive and complete declared stackup inputs before manufacturing', () => {
  expect(explicitBoardStackup(pcb)).toBe(true);
  expect(
    explicitBoardStackup(
      pcb.replace('(thickness 1.6)', '(thickness 0.05)').replace('(thickness 1.53)', '(thickness -0.02)'),
    ),
  ).toBe(false);
  expect(explicitBoardStackup(pcb.replace('(material "FR4")', '(material "")'))).toBe(false);
  expect(explicitBoardStackup(pcb.replace('(epsilon_r 4.5)', ''))).toBe(false);
  expect(explicitBoardStackup(pcb.replace('(loss_tangent 0.02)', ''))).toBe(false);
  expect(explicitBoardStackup(pcb.replace('(thickness 1.6)', '(thickness 2)'))).toBe(false);
  expect(explicitBoardStackup(pcb.replace('"B.Cu"', '"In1.Cu"'))).toBe(false);
});

it('retains unknown manufacturing constraints rather than substituting a default', () => {
  const rules = { source: 'https://example.com/manufacturing', clearanceMm: 0.2, trackWidthMm: 0.25, drillMm: 0.3 };

  expect(completeBoardRules(rules)).toBe(true);
  expect(completeBoardRules({ ...rules, source: '' })).toBe(false);
  expect(completeBoardRules({ ...rules, clearanceMm: null })).toBe(false);
  expect(completeBoardRules({ ...rules, trackWidthMm: null })).toBe(false);
  expect(completeBoardRules({ ...rules, drillMm: null })).toBe(false);
});

it('requires a complete pinned native report before removing incomplete-copper findings', () => {
  const report = JSON.stringify({
    kicad_version: '9.0.6',
    violations: [],
    unconnected_items: [],
    schematic_parity: [],
  });
  const clean = { version: '9.0.6', report, issues: [] };

  expect(connectedBoardReport(clean)).toBe(true);
  expect(connectedBoardReport({ ...clean, report: '{}' })).toBe(false);
  expect(connectedBoardReport({ ...clean, report: '(' })).toBe(false);
  expect(connectedBoardReport({ ...clean, version: null })).toBe(false);
  expect(connectedBoardReport({ ...clean, issues: ['board-unrouted'] })).toBe(false);
  expect(
    connectedBoardReport({ ...clean, report: report.replace('"unconnected_items":[]', '"unconnected_items":[{}]') }),
  ).toBe(false);
});
