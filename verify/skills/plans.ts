import fs from 'node:fs';
import path from 'node:path';
import type { MainModule } from '@mujoco/mujoco';
import type { Skill } from '../../src/skills/artifacts';
import type { Environment } from '../../src/skills/environment';
import type { Controller } from '../../src/sim/engine';
import type { SimModel } from '../../src/sim/mjcfTypes';
import type { ForgeRecord } from './forge';
import { perturbedPose, pronePose, startHeight, type JudgedEntry, type JudgeInput, type V3 } from './judge';

export const KIT_OUT = path.resolve('verify/out/kit');

export interface KitPlan {
  entry: JudgedEntry;
  budgetMin: number;
}

export const TOP_SPEED: Record<string, number> = { 'quad-servo': 0.2, hexapod: 0.2, 'biped-servo': 0.15 };

export const KIT_PLANS: Record<string, KitPlan[]> = {
  'quad-servo': [
    { entry: 'stand', budgetMin: 10 },
    { entry: 'velocity-tracking', budgetMin: 30 },
    { entry: 'get-up', budgetMin: 20 },
    { entry: 'settle-to-neutral', budgetMin: 10 },
  ],
  hexapod: [
    { entry: 'stand', budgetMin: 10 },
    { entry: 'velocity-tracking', budgetMin: 30 },
  ],
  'biped-servo': [
    { entry: 'stand', budgetMin: 15 },
    { entry: 'velocity-tracking', budgetMin: 45 },
  ],
};

export const entryDir = (robot: string, entry: string) => path.join(KIT_OUT, robot, entry);

export const writeJson = (dir: string, name: string, value: unknown) => {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, name), JSON.stringify(value, null, 2));
};

const readJson = <T>(dir: string, name: string) => JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8')) as T;

export interface StoredKitSkill {
  skill: Skill;
  environment: Environment;
  runs: ForgeRecord[];
}

export function loadKitSkill(robot: string, entry: JudgedEntry): StoredKitSkill {
  const dir = entryDir(robot, entry);

  return {
    skill: readJson<Skill>(dir, 'skill.json'),
    environment: readJson<Environment>(dir, 'environment.json'),
    runs: readJson<ForgeRecord[]>(dir, 'forge-runs.json'),
  };
}

export function skillStore(root: string) {
  const saved = new Map<string, string>();

  const save = async (relative: string, text: string) => {
    if (!/^library\/skills\/[0-9a-f]{64}\/skill\.json$/.test(relative)) throw new Error(`Unexpected path ${relative}`);

    saved.set(relative, text);
    fs.mkdirSync(path.dirname(path.join(root, relative)), { recursive: true });
    fs.writeFileSync(path.join(root, relative), text);
  };

  return { save, saved };
}

export function commanded(controller: Controller, command: V3): Controller {
  if (controller.kind !== 'policy') throw new Error('A velocity skill is a policy.');

  return { ...controller, policy: { ...controller.policy, command } };
}

export function judgeCommands(robot: string, entry: JudgedEntry): Array<V3 | undefined> {
  const top = TOP_SPEED[robot];

  if (entry !== 'velocity-tracking') return [undefined];

  return robot === 'biped-servo'
    ? [
        [top, 0, 0],
        [0, 0, 0],
      ]
    : [
        [top, 0, 0],
        [top / 2, 0, 0],
        [0, 0, 0],
      ];
}

export function judgeInput(mj: MainModule, model: SimModel, options: { entry: JudgedEntry; command?: V3 }): JudgeInput {
  const height = startHeight(mj, model);
  const { entry, command } = options;

  if (entry === 'get-up') return { model, entry, height, start: pronePose(mj, model) };

  if (entry === 'settle-to-neutral') return { model, entry, height, start: perturbedPose(model) };

  return { model, entry, height, command };
}

export function judgedController(skill: Skill, command: V3 | undefined): Controller {
  return command ? commanded(skill.controller, command) : skill.controller;
}
