import { describe, expect, it } from 'vitest';
import { box, component, row, run, XM430, type Measures } from '../../utils/engineering.fixtures';
import { tetherFieldsFor } from './tetherRows';

const tether = { volts: 12, amps: 10 };

const tethered = (volts: number, amps: number) => {
  const parts = Array.from({ length: 4 }, (_, i) => component(`s${i}`, XM430, { massG: 82 }));
  const measures: Measures = Object.fromEntries(
    parts.map((p, i) => [p.id, box([i * 50, 100, 0], [i * 50 + 28, 146, 34])]),
  );

  return run({ parts, measures, joints: [] }, { tether: { volts, amps } });
};

describe('tetherFieldsFor', () => {
  it('gives each power row the supply field it reads', () => {
    expect(tetherFieldsFor('Servo voltage', tether)).toEqual(['volts']);
    expect(tetherFieldsFor('Regulator input', tether)).toEqual(['volts']);
    expect(tetherFieldsFor('Supply current', tether)).toEqual(['amps']);
  });

  it('gives other rows nothing', () => {
    expect(tetherFieldsFor('Weight', tether)).toEqual([]);
    expect(tetherFieldsFor('Current and runtime', tether)).toEqual([]);
  });

  it('gives nothing while the build runs on a battery', () => {
    expect(tetherFieldsFor('Servo voltage', undefined)).toEqual([]);
  });

  it('names rows whose verdict follows the field it gives them', () => {
    expect(row(tethered(12, 10), 'Servo voltage')?.status).toBe('pass');
    expect(row(tethered(24, 10), 'Servo voltage')?.status).toBe('fail');
    expect(row(tethered(12, 10), 'Supply current')?.status).toBe('pass');
    expect(row(tethered(12, 0.5), 'Supply current')?.status).toBe('fail');
  });
});
