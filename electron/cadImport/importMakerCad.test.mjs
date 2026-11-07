import { describe, expect, it } from 'vitest';
import { portsFromHoles, sizeMismatch } from './importMakerCad.mjs';

describe('import_maker_cad checks', () => {
  it('accepts a size in any order, within tolerance', () => {
    expect(sizeMismatch([56, 85, 17], [85, 56, 17.2])).toBeNull();
  });

  it('flags a file that is not the size the datasheet says', () => {
    expect(sizeMismatch([56, 85, 17], [40, 30, 10])).toContain('the datasheet says');
  });

  it('flags a missing expected size rather than passing it', () => {
    expect(sizeMismatch([1, 2, 3], undefined)).toContain('no expected size');
  });

  it('turns through-holes into threaded mounting ports', () => {
    const [port] = portsFromHoles([{ position: [1.234, 0, 0], axis: [0, 1, 0], diameterMm: 2.7 }]);

    expect(port).toMatchObject({ name: 'hole-1', kind: 'screw', thread: 'M2.5', position: [1.23, 0, 0] });
  });
});
