import path from 'node:path';
import loadMujoco, { type MainModule } from '@mujoco/mujoco';
import { describe, expect, it } from 'vitest';
import { runArena } from '../../src/skills/arena';
import { skillFiles, skillHash, type Skill } from '../../src/skills/artifacts';
import { environmentHash } from '../../src/skills/environment';
import { runSolverRace, solveWith, type RaceOutcome, type RaceTask } from '../../src/skills/race';
import { routeTask, type Method } from '../../src/skills/router';
import { forgeRecordFor, forgeRunner, forgeSteps, type ForgeRecord } from './forge';
import { KIT_OUT, skillStore } from './plans';
import { ALTERNATIVES, RACE_SUITE } from './raceTasks';

const RACE_OUT = path.join(path.dirname(KIT_OUT), 'race');
const ALTERNATIVE_CAP_S = 10 * 60;

async function passesArena(mj: MainModule, task: RaceTask, skill: Skill) {
  const { model, environment } = task;
  const evidence = await runArena({
    mj,
    model,
    contract: environment.contract,
    controller: skill.controller,
    environment,
  });

  return evidence.passed;
}

async function timed<T>(run: () => Promise<T>) {
  const started = performance.now();
  const value = await run();

  return { value, wallS: (performance.now() - started) / 1000 };
}

function checkRecord(outcome: Extract<RaceOutcome, { kind: 'skill' }>, options: { task: RaceTask; wallS: number }) {
  const { skill, cost, method } = outcome;

  expect(skill.origin?.method).toBe(method);
  expect(skill.origin?.cost.steps).toBeLessThanOrEqual(cost.steps);
  expect(skill.origin?.cost.wallS).toBeLessThanOrEqual(cost.wallS);
  expect(Number.isFinite(cost.wallS) && cost.wallS >= 0).toBe(true);
  expect(cost.wallS).toBeLessThanOrEqual(options.wallS + 1);
  expect(skill.binding.design).toBe(options.task.design);
  expect(skill.evidence?.passed).toBe(true);
  expect(skill.evidence?.binding.environment).toBe(environmentHash(options.task.environment));
}

function checkRewardSearch(outcome: Extract<RaceOutcome, { kind: 'skill' }>, records: ForgeRecord[]) {
  const search = outcome.attempts.filter((a) => a.method === 'reward-search');
  const candidates = search.flatMap((a) => a.candidates);

  expect(candidates.some((c) => c.reward.kind === 'rewardlang')).toBe(true);
  expect(outcome.skill.controller.kind).toBe('policy');

  const policy = outcome.skill.controller.kind === 'policy' ? outcome.skill.controller.policy : null;

  expect(policy && forgeRecordFor(records, policy), 'the winning policy is one Forge wrote').toBeTruthy();
}

function capped(run: () => Promise<RaceOutcome>, capS: number): Promise<RaceOutcome | null> {
  const late = new Promise<null>((resolve) => setTimeout(() => resolve(null), capS * 1000 + 5000).unref());

  return Promise.race([run().catch(() => null), late]);
}

async function cheaperAlternative(options: { mj: MainModule; task: RaceTask; chosen: Method; wallS: number }) {
  const { mj, task, chosen, wallS } = options;
  const capS = Math.min(wallS / 2, ALTERNATIVE_CAP_S);
  const found: string[] = [];

  for (const method of ALTERNATIVES.filter((m) => m !== chosen)) {
    const forge = forgeRunner(path.join(RACE_OUT, task.id, `alt-${method}`));
    const store = skillStore(path.join(RACE_OUT, task.id, `alt-${method}`, 'store'));
    const signal = AbortSignal.timeout(capS * 1000);
    const run = await timed(() =>
      capped(() => solveWith({ mj, task, forge: forge.run, save: store.save, method, signal }), capS),
    );
    const outcome = run.value;
    const quick = run.wallS < capS && outcome?.kind === 'skill';

    if (quick && outcome?.kind === 'skill' && (await passesArena(mj, task, outcome.skill)))
      found.push(`${method} passed in ${run.wallS.toFixed(0)} s, the router's ${chosen} took ${wallS.toFixed(0)} s`);
  }

  return found;
}

describe('solver race', () => {
  for (const entry of RACE_SUITE) {
    it(
      `${entry.expected} wins its task, passes Arena, records method and cost, within 2× of the cheapest`,
      async () => {
        const mj = await loadMujoco();
        const task = entry.make(mj);
        const forge = forgeRunner(path.join(RACE_OUT, task.id, 'race'));
        const store = skillStore(path.join(RACE_OUT, task.id, 'race', 'store'));
        const { value: outcome, wallS } = await timed(() =>
          runSolverRace({ mj, task, forge: forge.run, save: store.save }),
        );

        expect(outcome.route).toEqual(routeTask(task.analysis));
        expect(outcome.kind, outcome.kind === 'not-found' ? outcome.reason : '').toBe('skill');

        if (outcome.kind !== 'skill') return;

        expect(outcome.method).toBe(entry.expected);
        expect(wallS, 'wall-clock budget').toBeLessThanOrEqual(entry.budgetMin * 60);
        expect(outcome.cost.steps).toBeGreaterThanOrEqual(forgeSteps(forge.records));
        checkRecord(outcome, { task, wallS });
        expect(JSON.parse(store.saved.get(skillFiles(skillHash(outcome.skill)).skill) ?? 'null')).toEqual(
          outcome.skill,
        );

        if (entry.expected === 'reward-search') checkRewardSearch(outcome, forge.records);

        expect(await passesArena(mj, task, outcome.skill), 'Arena rerun on the task contract').toBe(true);
        expect(await cheaperAlternative({ mj, task, chosen: outcome.method, wallS })).toEqual([]);
      },
      (entry.budgetMin * 60 + 3 * ALTERNATIVE_CAP_S + 900) * 1000,
    );
  }
});
