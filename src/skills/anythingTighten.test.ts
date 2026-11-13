import loadMujoco, { type MainModule } from '@mujoco/mujoco';
import { beforeAll, describe, expect, it } from 'vitest';
import { bodyFacts, type BodyFacts } from './anythingBody';
import { lowerSpec } from './anythingSignals';
import { claimSpec } from './anythingTighten';
import type { TaskSpec } from './anythingTypes';
import { evaluateContract } from './contract';
import { fixtureModel } from './fixtureModels';

let mj: MainModule;
let facts: BodyFacts;

beforeAll(async () => {
  mj = await loadMujoco();
  facts = bodyFacts(mj, fixtureModel('biped-servo'));
});

const DT = 0.02;
const TICKS = 301;

const CROUCH: TaskSpec = {
  kind: 'task',
  name: 'crouch and hold',
  seconds: 6,
  startOffsetDeg: 0,
  restIsGoal: false,
  success: {
    hold_for: { seconds: 2, state: { within: { sig: 'height', center: 0.114, tol: 0.015 } }, within: 'whole' },
  },
  failures: [
    {
      label: 'fell',
      formula: {
        eventually: {
          window: 'whole',
          state: {
            any: [{ atom: { sig: 'tilt', cmp: '>', value: 1 } }, { atom: { sig: 'height', cmp: '<', value: 0.0684 } }],
          },
        },
      },
    },
  ],
  intent: [{ t: 0 }, { t: 1.5, base: { up: -0.038 } }, { t: 4.5, base: { up: -0.038 } }],
};

function crouchTrace(tilt: number) {
  const ramp = (i: number, to: number, from: number) => from + (to - from) * Math.min(1, (i * DT) / 1.5);

  return {
    dt: DT,
    signals: {
      height: Array.from({ length: TICKS }, (_, i) => ramp(i, 0.114, 0.152)),
      tilt: Array.from({ length: TICKS }, (_, i) => ramp(i, tilt, 0.02)),
    },
  };
}

async function claimPasses(spec: TaskSpec, tilt: number, level = true) {
  const lowered = lowerSpec(claimSpec(spec, { level }), facts);

  return (await evaluateContract(lowered.contract, crouchTrace(tilt))).passed;
}

describe('claimSpec', () => {
  it('turns down a crouch held by pitching the body over, which the approved contract alone lets pass', async () => {
    const approved = lowerSpec(CROUCH, facts).contract;

    expect((await evaluateContract(approved, crouchTrace(0.48))).passed).toBe(true);
    expect(await claimPasses(CROUCH, 0.48)).toBe(false);
    expect(await claimPasses(CROUCH, 0.05)).toBe(true);
  });

  it('measures the level from the tilt the intent sketches, and skips it when asked', async () => {
    const leaning = {
      ...CROUCH,
      intent: CROUCH.intent.map((k) => (k.base ? { ...k, base: { ...k.base, tilt: 0.3 } } : k)),
    };

    expect(await claimPasses(leaning, 0.48)).toBe(true);
    expect(await claimPasses(CROUCH, 0.48, false)).toBe(true);
  });
});
