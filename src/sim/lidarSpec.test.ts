import { describe, expect, it } from 'vitest';
import { COMPONENTS, type ComponentInfo } from '../data/components';
import { lidarSpec, type LidarSpec } from './lidar';

const sensor = (specs: ComponentInfo['specs']): ComponentInfo => ({
  ...COMPONENTS.find((info) => info.group === 'LiDAR')!,
  specs,
});
const expected = (values: Partial<LidarSpec> = {}): LidarSpec => ({
  rays: 720,
  rangeM: 12,
  rateHz: 10,
  fovDeg: 360,
  ...values,
});
const cases: { specs: ComponentInfo['specs']; result: LidarSpec | null }[] = [
  { specs: [], result: null },
  { specs: [['Range', '12 mm']], result: null },
  { specs: [['Range', '0 m']], result: null },
  { specs: [['Range', '0.1–12 m']], result: expected() },
  { specs: [['Range', '0.1 - 1,200.5 m']], result: expected({ rangeM: 1200.5 }) },
  {
    specs: [
      ['Range', '12 m'],
      ['Scan rate', '5–15 Hz'],
      ['Sample rate', '5 kHz'],
    ],
    result: expected({ rays: 500 }),
  },
  {
    specs: [
      ['Range', '12 m'],
      ['Rotation', '5-8 Hz'],
      ['Point rate', '4,000 pts/s'],
    ],
    result: expected({ rays: 500, rateHz: 8 }),
  },
  {
    specs: [
      ['Range', '12 m'],
      ['Scan rate', '20 Hz'],
      ['Sample rate', '9,000 Hz'],
      ['Point rate', '100 pts/s'],
    ],
    result: expected({ rays: 450, rateHz: 20 }),
  },
  {
    specs: [
      ['Range', '12 m'],
      ['Field of view', '270°'],
      ['Resolution', '0.5°'],
    ],
    result: expected({ rays: 540, fovDeg: 270 }),
  },
  {
    specs: [
      ['Range', '12 m'],
      ['FOV', '180°'],
      ['Resolution', '1° over 270°'],
    ],
    result: expected({ rays: 270, fovDeg: 270 }),
  },
  {
    specs: [
      ['Range', '12 m'],
      ['FOV', '400°'],
      ['Point rate', '1 pts/s'],
    ],
    result: expected({ rays: 2 }),
  },
  {
    specs: [
      ['Range', '12 m'],
      ['Scan rate', 'unknown'],
      ['Sample rate', 'unknown'],
      ['Resolution', 'unknown'],
    ],
    result: expected(),
  },
];

describe('LiDAR specification patterns', () => {
  it('preserves units, precedence, defaults and limits across alternating repeated reads', () => {
    for (const entries of [cases, cases.toReversed(), cases]) {
      for (const { specs, result } of entries) {
        const info = sensor(specs);
        const before = structuredClone(info);

        expect(lidarSpec(info)).toEqual(result);
        expect(info).toEqual(before);
      }
    }
  });

  it('reads edits afresh and returns independent specifications', () => {
    const info = sensor([
      ['Range', '12 m'],
      ['Sample rate', '5 kHz'],
    ]);
    const first = lidarSpec(info);

    info.specs[1][1] = '4 kHz';
    expect(lidarSpec(info)).toEqual(expected({ rays: 400 }));
    expect(first).toEqual(expected({ rays: 500 }));
    expect(lidarSpec(info)).not.toBe(lidarSpec(info));
  });
});
