import { describe, expect, it } from 'vitest';
import { matches, type PlantedFault } from './personaScore';

const shafts: PlantedFault = {
  session: 8,
  kind: 'tiny',
  name: 'Shafts & Linear Bearingsh6 shafts, LM bushings',
  rect: { x: 60, y: 1405, width: 272, height: 14 },
  seen: [
    { x: 60, y: 1405, width: 272, height: 14 },
    { x: 60, y: 1772, width: 272, height: 14 },
  ],
};

describe('PersonaLab scoring', () => {
  it('matches a control named with the spacing a person reads, not the text the DOM joins', () => {
    expect(matches({ where: 'Shafts & Linear Bearings h6 shafts, LM bushings', problem: 'too short' }, shafts)).toBe(
      true,
    );
  });

  it('matches a finding at any place the control was while the persona looked', () => {
    expect(matches({ where: 'A short row', at: [195, 1780], problem: 'too short' }, shafts)).toBe(true);
  });

  it('never matches a finding somewhere the control never was', () => {
    expect(matches({ where: 'Sensors', at: [195, 690], problem: 'too dark' }, shafts)).toBe(false);
  });

  it('matches a finding by the point on screen when the scroll it estimated is off', () => {
    expect(matches({ where: 'A short row', at: [195, 2100], view: [195, 1410], problem: 'too short' }, shafts)).toBe(
      true,
    );
  });

  it('matches a control named by the misleading label planted on it, and only for that fault', () => {
    const relabelled: PlantedFault = { ...shafts, kind: 'misleading-label' };

    expect(matches({ where: 'Delete Everything', problem: 'sounds destructive' }, relabelled)).toBe(true);
    expect(matches({ where: 'Delete Everything', problem: 'sounds destructive' }, shafts)).toBe(false);
  });
});
