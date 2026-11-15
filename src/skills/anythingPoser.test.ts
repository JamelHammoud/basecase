import loadMujoco from '@mujoco/mujoco';
import { beforeAll, describe, expect, it } from 'vitest';
import { bodyFacts } from './anythingBody';
import { Poser } from './anythingPoser';
import { Statics } from './anythingStatics';
import type { IntentPose } from './anythingTypes';
import { fixtureModel } from './fixtureModels';

const SOLES = ['l_sole', 'r_sole'];
const CROUCH: IntentPose = { base: { up: -0.038 } };

let poser: Poser;
let statics: Statics;

beforeAll(async () => {
  const mj = await loadMujoco();
  const model = fixtureModel('biped-servo');

  poser = new Poser(mj, model, bodyFacts(mj, model));
  statics = new Statics({ mj, model, poser });
});

function restated(offsetMm: number): IntentPose {
  const height = (part: string) => poser.facts.parts.find((p) => p.id === part)!.height + offsetMm;

  return { ...CROUCH, parts: Object.fromEntries(SOLES.map((part) => [part, { height: height(part) }])) };
}

function soleShiftMm(q: number[]): number {
  poser.engine.setState(poser.facts.rest);

  const at = (part: string) => [...poser.engine.data.xpos.slice(poser.bodyOf(part) * 3, poser.bodyOf(part) * 3 + 3)];
  const rest = SOLES.map(at);

  poser.engine.setState(q);

  return Math.max(...SOLES.map((part, i) => Math.hypot(...at(part).map((v, k) => (v - rest[i][k]) * 1000))));
}

describe('Poser', () => {
  it('samples ordered pose states at duplicate keys and outside the clip', () => {
    const base = { forward: 0, left: 0, up: 0, tilt: 0 };
    const states = [1, 2, 2, 4].map((t, i) => ({ t, base, joints: poser.facts.rest.map((v) => v + i) }));
    const at = (t: number) => poser.frameAt(states, t);

    expect(at(-1)).toEqual(poser.withBase(states[0].joints, base));
    expect(at(2)).toEqual(poser.withBase(states[1].joints, base));
    expect(at(3)).toEqual(
      poser.withBase(
        poser.facts.rest.map((v) => v + 2.5),
        base,
      ),
    );
    expect(at(5)).toEqual(poser.withBase(states[3].joints, base));
  });

  it('samples a long pose clip without scanning its preceding states', () => {
    let reads = 0;
    const base = { forward: 0, left: 0, up: 0, tilt: 0 };
    const states = Array.from({ length: 65_536 }, (_, i) => ({
      get t() {
        reads++;

        return i;
      },
      base,
      joints: poser.facts.rest,
    }));

    expect(poser.frameAt(states, 65_534.5)).toEqual(poser.withBase(poser.facts.rest, base));
    expect(reads).toBeLessThanOrEqual(20);
  });

  it('keeps a foot planted when a crouch restates where it rests, and moves one that is lifted', () => {
    const planted = poser.keyQpos(CROUCH).q;

    expect(poser.keyQpos(restated(1)).q).toEqual(planted);
    expect(soleShiftMm(planted)).toBeLessThan(1);
    expect(soleShiftMm(poser.keyQpos(restated(30)).q)).toBeGreaterThan(10);
  });

  it('settles a restated foot the same as an unstated one through sag correction', () => {
    expect(statics.solve(restated(1), poser.facts.rest).values).toEqual(statics.solve(CROUCH, poser.facts.rest).values);
  });
});
