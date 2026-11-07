import fs from 'node:fs';
import path from 'node:path';
import loadMujoco, { type MainModule } from '@mujoco/mujoco';
import { expect } from 'vitest';
import { runArena } from '../../src/skills/arena';
import {
  currentDesign,
  SKILL_FORMAT,
  skillFiles,
  skillFreshness,
  skillHash,
  withEvidence,
  type Skill,
} from '../../src/skills/artifacts';
import type { Environment } from '../../src/skills/environment';
import { fixtureModel } from '../../src/skills/fixtureModels';
import { isHash } from '../../src/skills/hash';
import { kitSkillName, trainKitEntry, type KitEntry, type KitOutcome } from '../../src/skills/motorKit';
import type { SimModel } from '../../src/sim/mjcfTypes';
import { forgeRecordFor, forgeRunner, forgeSteps, type ForgeRecord } from './forge';
import { judgeEnvironment } from './judge';
import {
  entryDir,
  judgeCommands,
  judgedController,
  judgeInput,
  KIT_OUT,
  skillStore,
  writeJson,
  type KitPlan,
} from './plans';

const JUDGE_SLACK_MS = 15 * 60_000;

function checkCard(options: {
  skill: Skill;
  environment: Environment;
  design: string;
  model: SimModel;
  entry: KitEntry;
}) {
  const { skill, environment, design, model, entry } = options;

  expect(skill.format).toBe(SKILL_FORMAT);
  expect(skill.name).toBe(kitSkillName(entry));
  expect(skill.binding.design).toBe(design);
  expect(skill.evidence?.passed).toBe(true);
  expect(isHash(skill.evidence?.saltCommitment)).toBe(true);
  expect(() => withEvidence({ ...skill, evidence: null }, skill.evidence!, environment)).not.toThrow();
  expect(skillFreshness(skill, currentDesign({ design, model, environment }))).toBe('fresh');
}

function checkForge(options: {
  skill: Skill;
  records: ForgeRecord[];
  outcome: Extract<KitOutcome, { kind: 'skill' }>;
}) {
  const { skill, records, outcome } = options;

  expect(skill.controller.kind).toBe('policy');
  expect(records.length).toBeGreaterThan(0);

  const policy = skill.controller.kind === 'policy' ? skill.controller.policy : null;

  expect(policy && forgeRecordFor(records, policy)).toBeTruthy();
  expect(outcome.cost.forgeRuns).toBe(records.length);
  expect(outcome.cost.steps).toBeGreaterThanOrEqual(forgeSteps(records));
}

function checkSaved(skill: Skill, saved: Map<string, string>) {
  const text = saved.get(skillFiles(skillHash(skill)).skill);

  expect(text).toBeDefined();
  expect(JSON.parse(text!)).toEqual(skill);
}

async function checkArena(options: { mj: MainModule; model: SimModel; robot: string; plan: KitPlan; skill: Skill }) {
  const { mj, model, robot, plan, skill } = options;

  for (const command of judgeCommands(robot, plan.entry)) {
    const environment = judgeEnvironment(judgeInput(mj, model, { entry: plan.entry, command }));
    const controller = judgedController(skill, command);
    const evidence = await runArena({ mj, model, contract: environment.contract, controller, environment });

    expect(evidence.passed, `${plan.entry} at ${JSON.stringify(command ?? 'start')}: ${evidence.summary}`).toBe(true);
  }
}

async function checkOwnArena(options: { mj: MainModule; model: SimModel; skill: Skill; environment: Environment }) {
  const { mj, model, skill, environment } = options;
  const contract = environment.contract;
  const own = await runArena({ mj, model, contract, controller: skill.controller, environment });

  expect(own.passed, own.summary).toBe(true);

  const limp = await runArena({ mj, model, contract, controller: { kind: 'limp' }, environment });

  return limp.passed;
}

async function limpFailsJudge(options: { mj: MainModule; model: SimModel; robot: string; plan: KitPlan }) {
  const { mj, model, robot, plan } = options;
  const command = judgeCommands(robot, plan.entry)[0];
  const environment = judgeEnvironment(judgeInput(mj, model, { entry: plan.entry, command }));
  const limp = await runArena({ mj, model, contract: environment.contract, controller: { kind: 'limp' }, environment });

  return !limp.passed;
}

export async function trainAndJudge(robot: string, plan: KitPlan) {
  const mj = await loadMujoco();
  const model = fixtureModel(robot);
  const dir = entryDir(robot, plan.entry);
  const forge = forgeRunner(path.join(dir, 'runs'));
  const store = skillStore(path.join(dir, 'store'));
  const started = performance.now();
  const outcome = await trainKitEntry({
    mj,
    design: robot,
    model,
    entry: plan.entry,
    forge: forge.run,
    save: store.save,
  });
  const wallS = (performance.now() - started) / 1000;

  writeJson(dir, 'outcome.json', { wallS, budgetS: plan.budgetMin * 60, outcome });
  writeJson(dir, 'forge-runs.json', forge.records);
  expect(outcome.kind, outcome.kind === 'refused' ? outcome.reason : '').toBe('skill');

  if (outcome.kind !== 'skill') return null;

  const { skill, environment } = outcome;

  writeJson(dir, 'skill.json', skill);
  writeJson(dir, 'environment.json', environment);
  expect(wallS, 'wall-clock budget').toBeLessThanOrEqual(plan.budgetMin * 60);
  expect(outcome.cost.wallS).toBeLessThanOrEqual(wallS + 1);
  checkCard({ skill, environment, design: robot, model, entry: plan.entry });
  checkForge({ skill, records: forge.records, outcome });
  checkSaved(skill, store.saved);

  const ownLimpPasses = await checkOwnArena({ mj, model, skill, environment });

  if (await limpFailsJudge({ mj, model, robot, plan }))
    expect(ownLimpPasses, 'the Kit contract passes limp').toBe(false);

  await checkArena({ mj, model, robot, plan, skill });

  return skillHash(skill);
}

export const clearKitOut = (robot: string) => fs.rmSync(path.join(KIT_OUT, robot), { recursive: true, force: true });

export const kitTitle = (plan: KitPlan) =>
  `trains ${plan.entry} through Forge within ${plan.budgetMin} min and passes Arena`;

export const kitTimeout = (plan: KitPlan) => plan.budgetMin * 60_000 + JUDGE_SLACK_MS;
