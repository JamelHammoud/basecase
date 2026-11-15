import { describe, expect, it } from 'vitest';
import type { SimModel } from '../sim/mjcfTypes';
import { MAX_REFERENCE_FRAMES, type MoveReference } from './environment';
import { fixtureModel } from './fixtureModels';
import { KIT_ACTION_SCALE, kitRobot, neutralRad } from './kitModel';
import { MOVE_BARS, moveActionScale, moveContract } from './moveEnvironment';
import { lowestHeight } from './moveReference';
import { moveTube, outsideTube, type TubeWindow } from './moveTube';

const models = ['arm-3dof', 'quad-servo', 'hexapod'].map((id) => fixtureModel(id));
const amplitudes = [0, 0.1, 0.5, 1.2, 4];

function referenceFor(model: SimModel, seed: number): MoveReference {
  const joints = kitRobot(model).joints;
  const home = joints.map((id) => neutralRad(model, id));
  const frames = Array.from({ length: seed * 3 + 2 }, (_, k) => [
    ...home.map((h, j) => h + Math.sin(k * 0.3 + j) * amplitudes[seed % amplitudes.length]),
    0.3 + Math.cos(k * 0.7) * 0.1,
    Math.abs(Math.sin(k * 0.2 + seed)) * (seed % 3),
  ]);

  return { joints, controlDt: 0.02, loop: seed % 2 === 0, frames };
}

function previousScale(model: SimModel, reference: MoveReference) {
  const home = reference.joints.map((id) => neutralRad(model, id));
  const reach = Math.max(...reference.frames.flatMap((frame) => home.map((h, j) => Math.abs(frame[j] - h))));

  return Math.min(MOVE_BARS.maxScale, Math.max(KIT_ACTION_SCALE, reach * MOVE_BARS.scaleMargin));
}

function previousFailure(reference: MoveReference) {
  const height = Math.min(...reference.frames.map((frame) => frame[reference.joints.length]));
  const tilt = Math.max(...reference.frames.map((frame) => frame[reference.joints.length + 1]));

  return [
    {
      label: 'fell',
      formula: {
        eventually: {
          window: 'whole',
          state: {
            any: [
              {
                atom: {
                  expr: { signal: 'tilt' },
                  cmp: '>',
                  value: Math.max(MOVE_BARS.fellTiltRad, tilt + 0.5),
                  scale: 0.1,
                },
              },
              {
                atom: {
                  expr: { signal: 'height' },
                  cmp: '<',
                  value: MOVE_BARS.fellHeightShare * height,
                  scale: 0.02,
                },
              },
            ],
          },
        },
      },
    },
  ];
}

const previousDistance = (tube: TubeWindow[], values: number[]) =>
  Math.max(...tube.flatMap((window) => window.bands.map(([lo, hi], j) => Math.max(lo - values[j], values[j] - hi))));

function compareSummaries(model: SimModel, reference: MoveReference) {
  const saved = structuredClone(reference);
  const home = reference.joints.map((id) => neutralRad(model, id));
  const tube = moveTube(reference, { horizonS: 4, toleranceRad: MOVE_BARS.toleranceRad });

  expect(moveActionScale(model, reference)).toBe(previousScale(model, reference));
  expect(lowestHeight(reference)).toBe(Math.min(...reference.frames.map((frame) => frame[reference.joints.length])));
  expect(moveContract(model, reference).failures).toEqual(previousFailure(reference));
  expect(outsideTube(tube, home)).toBe(previousDistance(tube, home));
  expect(reference).toEqual(saved);
}

describe('motion reference extrema', () => {
  it('preserves action scales, fall thresholds and rest-pose distances across robot motions', () => {
    for (let seed = 0; seed < 30; seed++) {
      const model = models[seed % models.length];

      compareSummaries(model, referenceFor(model, seed));
    }
  });

  it('reads edited reference frames and rest poses without retaining previous extrema', () => {
    const model = structuredClone(models[1]);
    const reference = referenceFor(model, 7);

    compareSummaries(model, reference);
    reference.frames[0][0] += 4;
    reference.frames[1][reference.joints.length] = 0.01;
    reference.frames[0][reference.joints.length + 1] = 2.8;
    compareSummaries(model, reference);
    model.initial.values[reference.joints[0]] = 90;
    compareSummaries(model, reference);
  });

  it('handles the full reference frame limit without flattening joint samples into function arguments', () => {
    const model = models[1];
    const joints = kitRobot(model).joints;
    const home = joints.map((id) => neutralRad(model, id));
    const reference: MoveReference = {
      joints,
      controlDt: 0.02,
      loop: false,
      frames: Array.from({ length: MAX_REFERENCE_FRAMES }, () => [...home, 0.4, 0]),
    };

    reference.frames[MAX_REFERENCE_FRAMES - 1][joints.length - 1] += 1;
    reference.frames[MAX_REFERENCE_FRAMES - 1][joints.length] = 0.1;
    expect(moveActionScale(model, reference)).toBe(MOVE_BARS.scaleMargin);
    expect(lowestHeight(reference)).toBeCloseTo(0.1);
  });

  it('preserves empty, nonfinite and signed-zero reductions', () => {
    const model = models[0];
    const empty: MoveReference = { joints: [], controlDt: 0.02, loop: false, frames: [] };

    expect(lowestHeight(empty)).toBe(Infinity);
    expect(moveActionScale(model, empty)).toBe(KIT_ACTION_SCALE);
    expect(outsideTube([], [])).toBe(-Infinity);
    expect(outsideTube([{ from: 0, to: 1, bands: [] }], [])).toBe(-Infinity);

    for (const value of [-0, 0, NaN, Infinity, -Infinity]) {
      const reference = referenceFor(model, 1);

      reference.frames[0].fill(value);
      compareSummaries(model, reference);
      expect(lowestHeight({ ...empty, frames: [[value], [0]] })).toBe(Math.min(value, 0));
    }
  });

  it('preserves tube distances at boundaries, across ragged windows and after edits', () => {
    const tube: TubeWindow[] = [
      {
        from: 0,
        to: 1,
        bands: [
          [-1, 1],
          [2, 3],
        ],
      },
      { from: 1, to: 2, bands: [] },
      { from: 2, to: 3, bands: [[-0, 0]] },
    ];

    for (const values of [[0, 2], [1, 3], [-1, 1], [2, 4], [NaN, 0], [Infinity, 0], [], [-0]]) {
      const saved = structuredClone({ tube, values });

      expect(outsideTube(tube, values)).toBe(previousDistance(tube, values));
      expect({ tube, values }).toEqual(saved);
    }

    tube[0].bands[0] = [-5, -2];
    expect(outsideTube(tube, [0, 2])).toBe(2);
  });
});
