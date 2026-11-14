import { describe, expect, it } from 'vitest';
import { matches, type PlantedFault } from './personaScore';

const row = { x: 60, width: 272, height: 14 };

const shafts: PlantedFault = {
  session: 8,
  kind: 'tiny',
  name: 'Shafts & Linear Bearingsh6 shafts, LM bushings',
  rect: { ...row, y: 1405 },
  held: [
    { ...row, y: 1405, from: 0, to: 60000 },
    { ...row, y: 1005, from: 60250, to: 120000 },
  ],
};

describe('PersonaLab scoring', () => {
  it('matches a control named with the spacing a person reads, not the text the DOM joins', () => {
    expect(matches({ where: 'Shafts & Linear Bearings h6 shafts, LM bushings', problem: 'too short' }, shafts)).toBe(
      true,
    );
  });

  it('matches a scroll-corrected point inside where the control was before the session, without a time', () => {
    expect(matches({ where: 'A short row', at: [195, 1410], problem: 'too short' }, shafts)).toBe(true);
  });

  it('matches an on-screen point inside where the control was when the screenshot was taken', () => {
    expect(
      matches({ where: 'A short row', at: [195, 1700], view: [195, 1010], t: 90000, problem: 'too short' }, shafts),
    ).toBe(true);
  });

  it('never matches another row at a place the planted control held at another moment', () => {
    const after = (view: [number, number], at: [number, number]) =>
      matches({ where: 'Another row', at, view, t: 90000, problem: 'too short' }, shafts);

    expect(after([195, 605], [195, 1005])).toBe(false);
    expect(after([195, 1405], [195, 1805])).toBe(false);
    expect(matches({ where: 'Another row', at: [195, 1005], t: 30000, problem: 'too short' }, shafts)).toBe(false);
  });

  it('never matches a finding somewhere the control never was', () => {
    expect(matches({ where: 'Sensors', at: [195, 690], t: 30000, problem: 'too dark' }, shafts)).toBe(false);
  });

  it('matches a control named by the misleading label planted on it, and only for that fault', () => {
    const relabelled: PlantedFault = { ...shafts, kind: 'misleading-label' };

    expect(matches({ where: 'Delete Everything', problem: 'sounds destructive' }, relabelled)).toBe(true);
    expect(matches({ where: 'Delete Everything', problem: 'sounds destructive' }, shafts)).toBe(false);
  });
});
