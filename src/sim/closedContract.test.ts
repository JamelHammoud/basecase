import loadMujoco from '@mujoco/mujoco';
import * as THREE from 'three';
import { expect, it } from 'vitest';
import { findPort, worldPort } from '../agent/ports';
import { evaluateContract, type Contract } from '../skills/contract';
import { modelHashes } from '../skills/artifacts';
import { SimEngine } from './engine';
import { closedLinkage } from './fixtures/closedLinkages';
import { simDelta } from './mjcfFrames';

const contract: Contract = {
  version: 1,
  success: {
    all: [
      { always: { window: 'whole', state: { atom: { expr: { signal: 'gap' }, cmp: '<', value: 0.15, scale: 0.15 } } } },
      {
        eventually: {
          window: 'whole',
          state: { atom: { expr: { signal: 'crank' }, cmp: '>', value: 0.05, scale: 0.05 } },
        },
      },
    ],
  },
  failures: [],
};

it('judges loaded motion with the unchanged contract evaluator and catches locked and broken controls', async () => {
  const mj = await loadMujoco();
  const { model, input } = closedLinkage({ name: 'loaded vertical', lengths: [40, 20, 50, 50], tilted: true });
  const broken = { ...model, xml: model.xml.replace(/<equality>[\s\S]*?<\/equality>/, '') };

  expect(modelHashes(broken).physics).not.toBe(modelHashes(model).physics);

  const results = [];

  for (const mode of ['normal', 'locked', 'broken']) {
    const engine = new SimEngine(mj, mode === 'broken' ? broken : model);
    const pins = ['fb0-coupler', 'fb0-rocker'].map((id) => {
      const part = input.parts.find((p) => p.id === id)!;

      return { id, at: new THREE.Vector3(...worldPort(part, findPort(part, 'C')!).position) };
    });
    const signals = { gap: [] as number[], crank: [] as number[] };

    try {
      if (mode === 'locked') engine.setFault('fb0-crank-joint', 'stuck');

      for (let i = 0; i < 30; i++) {
        engine.setController({ kind: 'hold', values: { 'fb0-crank-joint': i / 2 } });
        engine.step(0.02);

        const [a, b] = pins.map(({ id, at }) => at.clone().applyMatrix4(simDelta(model, engine.poses(), id)!));

        signals.gap.push(a.distanceTo(b));
        signals.crank.push(engine.jointAngles()[0]);
      }

      results.push(await evaluateContract(contract, { dt: 0.02, signals }));
    } finally {
      engine.dispose();
    }
  }

  expect(results.map((result) => result.passed)).toEqual([true, false, false]);
});
