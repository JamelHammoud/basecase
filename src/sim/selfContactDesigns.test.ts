import loadMujoco, { type MainModule } from '@mujoco/mujoco';
import { beforeAll, expect, it } from 'vitest';
import { SimEngine } from './engine';
import { buildMjcf } from './mjcf';
import { prepareContactModel } from './contactPreparationClient';
import { selfContactDesigns } from './fixtures/selfContactDesigns';
import { captureContactReplay } from './fixtures/contactReplay';
import { nativeContactReplay } from '../../tools/sim/nativeContactReplay.mjs';
import { replayDifferences } from '../../tools/sim/contactReplayComparison.mjs';

let mj: MainModule;

beforeAll(async () => {
  mj = await loadMujoco();
});

function pairs(engine: SimEngine): Set<string> {
  const contacts = engine.contactPairs();
  const result = new Set<string>();

  for (let i = 0; i < contacts.length; i += 2) {
    const first = engine.sim.bodies[contacts[i]].parts;
    const second = engine.sim.bodies[contacts[i + 1]].parts;

    for (const a of first) for (const b of second) result.add([a, b].sort().join('/'));
  }

  return result;
}

it.each(selfContactDesigns)(
  '$name contacts the expected non-adjacent link with independent excluded and separated controls',
  async (spec) => {
    const fixture = spec.build();
    const model = await prepareContactModel(fixture.input);
    const engine = new SimEngine(mj, model);
    const expected = fixture.expected.slice().sort().join('/');
    const excluded = fixture.excluded.slice().sort().join('/');
    const contacts = new Set<string>();

    try {
      expect(pairs(engine).has(expected)).toBe(false);
      engine.setController({ kind: 'hold' });

      for (let i = 0; i < 10; i++) engine.step(0.02);

      expect(pairs(engine).has(expected)).toBe(false);
      engine.setController({ kind: 'hold', values: fixture.reference });

      for (let i = 0; i < 150; i++) {
        engine.step(0.02);

        for (const pair of pairs(engine)) contacts.add(pair);
      }

      expect(contacts).toContain(expected);
      expect(contacts.has(excluded)).toBe(false);
    } finally {
      engine.dispose();
    }

    const disabled = { ...fixture.input, project: { ...fixture.input.project, selfContact: {} } };
    const passing = new SimEngine(mj, buildMjcf(disabled));

    try {
      passing.setController({ kind: 'hold', values: fixture.reference });

      for (let i = 0; i < 150; i++) passing.step(0.02);

      expect(pairs(passing).has(expected)).toBe(false);
    } finally {
      passing.dispose();
    }
  },
);

it.each(selfContactDesigns)(
  '$name replays the same contact identities and states in native C and WASM',
  async (spec) => {
    const fixture = spec.build();
    const model = await prepareContactModel(fixture.input);
    const capture = captureContactReplay(mj);
    const engine = new SimEngine(capture.module, model);

    try {
      engine.setController({ kind: 'hold', values: fixture.reference });

      for (let i = 0; i < 150; i++) engine.step(0.02);

      const replay = capture.finish(`self-contact-${spec.name}`, model);
      const native = await nativeContactReplay(replay, mj.mj_versionString());
      const differences = replayDifferences(replay, native.cases[0]);

      expect(differences.contactDifferences).toBe(0);
      expect(differences.drift).toBeLessThan(1e-6);
    } finally {
      engine.dispose();
    }
  },
);
