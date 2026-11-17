import { expect, it } from 'vitest';
import { copperViolatesExclusions, validCopperExclusions } from './boardCopperExclusions.mjs';

const exclusions: import('./boardCopperExclusions.mjs').CopperExclusion[] = [{ min: [-1, -1], max: [1, 1] }];
const pcb = (copper: string) => `(kicad_pcb ${copper})`;
const track = (start: string, end: string, width = 0.2) =>
  `(segment (start ${start}) (end ${end}) (width ${width}) (layer "F.Cu") (net 1))`;

it('checks full copper width across forbidden rectangles independently of router output', () => {
  expect(copperViolatesExclusions(pcb(track('-2 0', '2 0')), exclusions)).toBe(true);
  expect(copperViolatesExclusions(pcb(track('-2 1.05', '2 1.05')), exclusions)).toBe(true);
  expect(copperViolatesExclusions(pcb(track('-2 1.2', '2 1.2')), exclusions)).toBe(false);
  expect(copperViolatesExclusions(pcb(track('1.08 1.08', '2 2')), exclusions)).toBe(false);
  expect(copperViolatesExclusions(pcb(track('0 0', '0.5 0.5')), exclusions)).toBe(true);
});

it('checks the full via diameter against the same exclusions', () => {
  expect(copperViolatesExclusions(pcb('(via (at 1.2 0) (size 0.8) (drill 0.4))'), exclusions)).toBe(true);
  expect(copperViolatesExclusions(pcb('(via (at 2 0) (size 0.8) (drill 0.4))'), exclusions)).toBe(false);
});

it('refuses unbounded or malformed copper exclusions', () => {
  expect(validCopperExclusions(exclusions)).toBe(true);

  for (const value of [
    [{ min: [0, 0], max: [Infinity, 1] }],
    [{ min: [1, 1], max: [0, 0] }],
    Array(513).fill(exclusions[0]),
    [{ ...exclusions[0], file: '../private' }],
  ])
    expect(validCopperExclusions(value)).toBe(false);
});
