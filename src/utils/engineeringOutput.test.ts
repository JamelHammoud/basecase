import { describe, expect, it } from 'vitest';
import { box, component, joint, part, run } from './engineering.fixtures';
import { dot, lineDistance, norm, type V3 } from './engineeringMath';
import type { ServoLine, ServoOutput, SweepRequest } from './engineeringTypes';
import { seededRandom } from './seededRandom';

const scene = () => ({
  parts: [part('frame'), part('link'), component('s', 'feetech-sts3215', { componentVariant: 'c001' })],
  measures: {
    frame: box([0, 0, 0], [10, 10, 10]),
    link: box([0, 0, 40], [40, 10, 50]),
    s: box([0, 50, 0], [40, 90, 20]),
  },
  joints: [joint('j', { parent: ['frame'], child: ['link'], actuators: ['s'], axis: [0, 4, 0] })],
});

function previousChoice(output: ServoOutput, axis: V3): ServoLine {
  const a = norm(axis);
  const offsets = (output.alternates ?? []).map((line) => ({
    line,
    angle: (Math.acos(Math.min(1, Math.abs(dot(line.axis, a)))) * 180) / Math.PI,
    off: lineDistance(line.point, [0, 0, 0], a),
  }));

  return offsets.find((o) => !(o.angle > 3 || o.off > 1.5))?.line ?? output;
}

function report(output?: ServoOutput, axis: V3 = [0, 4, 0]) {
  const s = scene();
  const sweeps: SweepRequest[] = [];

  s.joints[0].axis = axis;

  const result = run(
    s,
    {},
    {
      servoOutputs: output ? { s: output } : {},
      sweep: (request) => {
        sweeps.push(request);

        return [];
      },
    },
  );

  return { result, sweeps };
}

describe('Servo output search', () => {
  it('preserves complete reports and sweep actuator choices across alternate layouts and later edits', () => {
    const random = seededRandom('57e71a0b2c6d438f90aebc112548a907');
    const line = (): ServoLine => ({
      point: [random() * 6 - 3, random() * 30, 0],
      axis: [0, random() > 0.3 ? 1 : -1, 0],
    });

    for (let i = 0; i < 80; i++) {
      const output: ServoOutput = { ...line(), alternates: Array.from({ length: i % 12 }, line) };
      const axis: V3 = i % 9 === 0 ? [0, 0, 0] : [0, 4, 0];
      const expected = report(previousChoice(output, axis), axis);

      expect(report(output, axis)).toEqual(expected);
      output.alternates?.unshift({ point: [0, 0, 0], axis: [0, -1, 0] });
      expect(report(output, axis)).toEqual(report(previousChoice(output, axis), axis));
    }
  });

  it('retains offset thresholds, angular thresholds, missing outputs and primary fallback', () => {
    const main: ServoLine = { point: [10, 0, 0], axis: [1, 0, 0] };
    const tilts = [0, 2.999, 3, 3.001, 180];

    for (const offset of [0, 1.499, 1.5, 1.501, 20]) {
      for (const tilt of tilts) {
        const radians = (tilt * Math.PI) / 180;
        const output = {
          ...main,
          alternates: [{ point: [offset, 0, 0] as V3, axis: [Math.sin(radians), Math.cos(radians), 0] as V3 }],
        };

        expect(report(output)).toEqual(report(previousChoice(output, [0, 4, 0])));
      }
    }

    expect(report().result.rows.find((r) => r.check === 'Servo alignment')?.status).toBe('not run');
    expect(report(main).sweeps[0].actuators).toEqual([]);
  });

  it.each([300, 600])('stops both consumers at the first aligned output among %i alternates', (count) => {
    let reads = 0;
    const alternates = Array.from({ length: count }, (): ServoLine => ({
      point: [0, 0, 0],
      get axis(): V3 {
        reads++;

        return [0, 1, 0];
      },
    }));
    const output: ServoOutput = { point: [10, 0, 0], axis: [1, 0, 0], alternates };
    const actual = report(output);

    expect(actual.result.rows.find((r) => r.check === 'Servo alignment')?.status).toBe('pass');
    expect(actual.sweeps[0].actuators).toEqual(['s']);
    expect(reads).toBe(2);
  });
});
