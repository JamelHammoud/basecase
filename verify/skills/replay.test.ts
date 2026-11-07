import loadMujoco, { type MainModule } from '@mujoco/mujoco';
import { describe, expect, it } from 'vitest';
import { signalReaders } from '../../src/skills/arenaSignals';
import { evaluateContract } from '../../src/skills/contract';
import type { Environment } from '../../src/skills/environment';
import { fixtureModel } from '../../src/skills/fixtureModels';
import { SimEngine, type Controller } from '../../src/sim/engine';
import type { SimModel } from '../../src/sim/mjcfTypes';
import { act, isPolicySpec } from '../../src/sim/policy';
import { forgeRecordFor } from './forge';
import { judgeEnvironment } from './judge';
import { judgeCommands, judgedController, judgeInput, KIT_PLANS, loadKitSkill } from './plans';

function cleanTrace(options: { mj: MainModule; model: SimModel; environment: Environment; controller: Controller }) {
  const { mj, model, environment, controller } = options;
  const engine = new SimEngine(mj, model);

  try {
    engine.setController(controller);
    engine.reset(environment.reset.pose ?? model.initial);

    const readers = signalReaders({ mj, engine, robot: environment.robot }, environment.signals);
    const names = Object.keys(readers);
    const signals: Record<string, number[]> = Object.fromEntries(names.map((n) => [n, []]));
    const ticks = Math.floor(environment.horizonS / environment.traceDt + 1e-9) + 1;

    for (let tick = 0; tick < ticks; tick++) {
      if (tick > 0) engine.step(environment.traceDt);

      for (const name of names) signals[name].push(readers[name]());
    }

    return { dt: environment.traceDt, signals };
  } finally {
    engine.dispose();
  }
}

const cases = Object.entries(KIT_PLANS).flatMap(([robot, plans]) => plans.map((p) => ({ robot, entry: p.entry })));

describe('train here, judge there', () => {
  for (const { robot, entry } of cases) {
    it(`${robot} ${entry}: the Forge policy acts the same in the app and passes a clean WASM replay`, async () => {
      const mj = await loadMujoco();
      const model = fixtureModel(robot);
      const { skill, runs } = loadKitSkill(robot, entry);

      expect(skill.controller.kind).toBe('policy');

      const policy = skill.controller.kind === 'policy' ? skill.controller.policy : null;

      expect(isPolicySpec(policy)).toBe(true);

      const record = forgeRecordFor(runs, policy!);

      expect(record, 'the skill policy is one Forge wrote').toBeTruthy();
      expect(record!.check.length).toBeGreaterThanOrEqual(8);

      for (const s of record!.check) {
        const a = act(policy!, Float32Array.from(s.obs));

        a.forEach((v, i) => expect(Math.abs(v - s.action[i])).toBeLessThan(1e-3));
      }

      for (const command of judgeCommands(robot, entry)) {
        const environment = judgeEnvironment(judgeInput(mj, model, { entry, command }));
        const trace = cleanTrace({ mj, model, environment, controller: judgedController(skill, command) });
        const verdict = await evaluateContract(environment.contract, trace);

        expect(verdict.passed, `${JSON.stringify(command ?? 'start')}: margin ${verdict.margin}`).toBe(true);
      }
    }, 300_000);
  }
});
