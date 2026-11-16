import { describe, expect, it } from 'vitest';
import { checkedRegistration, locatePose, registerControls } from './registration.mjs';

const controls = {
  datum: 'WGS84' as const,
  vertical: { kind: 'ellipsoid' as const },
  controls: [
    { local: [0, 0, 0] as [number, number, number], latitude: 0, longitude: 179.9999, altitudeM: 20 },
    { local: [20, 0, 0] as [number, number, number], latitude: 0, longitude: -179.9999203369, altitudeM: 20 },
  ],
};

describe('Fleet site registration', () => {
  it('preserves a declared frame across serialization and the antimeridian', () => {
    const registered = registerControls(controls);
    const restored = checkedRegistration(JSON.parse(JSON.stringify(registered)));
    const point = locatePose({ frame: 'facility', pointM: [20, 0, 30], quality: 'reported', floor: 'roof' }, restored);

    expect(point?.longitude).toBeLessThan(-179.99);
    expect(point?.altitudeM).toBeCloseTo(50, 2);
    expect(point?.quality).toBe('reported');
    expect(point?.floor).toBe('roof');
    expect(restored).toEqual(registered);
  });

  it('requires explicit registration and refuses incompatible vertical datums', () => {
    expect(locatePose({ frame: 'facility', pointM: [0, 0, 0], quality: 'reported' }, null)).toBeNull();
    expect(() => registerControls({ ...controls, datum: 'NAD83' })).toThrow();
    expect(() => registerControls({ ...controls, vertical: { kind: 'orthometric' } })).toThrow();
    expect(() => registerControls({ ...controls, controls: [controls.controls[0], controls.controls[0]] })).toThrow();
  });

  it.each([
    ['drone', 130, 'reported'],
    ['vessel', -4, 'estimated'],
    ['hospital floor', 12, 'reported'],
  ] as const)('retains %s altitude and quality', (_name, altitudeM, quality) => {
    const pose = locatePose(
      {
        frame: 'WGS84',
        latitude: 35,
        longitude: 140,
        altitudeM,
        quality,
        datum: 'WGS84',
        vertical: { kind: 'ellipsoid' },
      },
      null,
    );

    expect(pose?.altitudeM).toBe(altitudeM);
    expect(pose?.quality).toBe(quality);
  });
});
