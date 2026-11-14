import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ASSEMBLY_TASKS } from './assembly.mjs';
import { CASE_TASKS } from './cases.mjs';
import { CASE_APP_TASKS } from './caseApps.mjs';
import { CASE_CODE_TASKS } from './caseCode.mjs';
import { COST_TASKS, SERVICE_TASKS } from './serviceCost.mjs';
import { CRAFT_TASKS, INTEGRITY_TASKS, MIRROR_TASKS } from './quality.mjs';
import { RIG_TASKS } from './rigging.mjs';
import { allOf, pending } from '../checks.mjs';
import { harvestedTask } from '../harvest/kinds.mjs';
import { readStubs } from '../stubs.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));

export const MICRO_DATA = path.resolve(here, '../../data/micro');

export const HARVESTED_DIR = path.join(here, 'harvested');

export const SEED_TASKS = [
  ...ASSEMBLY_TASKS,
  ...SERVICE_TASKS,
  ...COST_TASKS,
  ...INTEGRITY_TASKS,
  ...CRAFT_TASKS,
  ...MIRROR_TASKS,
  ...RIG_TASKS,
  ...CASE_TASKS,
  ...CASE_APP_TASKS,
  ...CASE_CODE_TASKS,
];

export function realScenePath(name, dataDir = MICRO_DATA) {
  return name ? path.join(dataDir, 'scenes', `${name}.json`) : null;
}

export function hasRealScene(task, dataDir = MICRO_DATA) {
  const file = realScenePath(task.realScene, dataDir);

  return !!file && fs.existsSync(file);
}

const harvestNumber = (task) => Number(task.id.slice(1));

export const HARVESTED_TASKS = readStubs(HARVESTED_DIR)
  .map(({ stub }) => harvestedTask(stub))
  .sort((a, b) => harvestNumber(a) - harvestNumber(b));

export const ALL_TASKS = [...SEED_TASKS, ...HARVESTED_TASKS];

function stubTask(dir, stub) {
  return {
    id: stub.id,
    category: stub.category ?? 'critique',
    title: stub.title ?? stub.instruction.slice(0, 60),
    heldOut: !!stub.heldOut,
    instruction: stub.instruction,
    source: stub.source,
    startFile: path.join(dir, stub.startScene ?? 'start.json'),
    fixture: null,
    grade: allOf(pending('Grader not written yet')),
    stub: true,
  };
}

export const stubTasks = (dataDir = MICRO_DATA) =>
  readStubs(path.join(dataDir, 'stubs')).map(({ dir, stub }) => stubTask(dir, stub));

export function startSceneFile(task, dataDir = MICRO_DATA) {
  if (task.startFile) return task.startFile;

  return hasRealScene(task, dataDir) ? realScenePath(task.realScene, dataDir) : null;
}

export function runnable(task, dataDir = MICRO_DATA) {
  return !task.disabled && !!(task.fixture || task.startScene || startSceneFile(task, dataDir));
}

export function selectTasks({ ids, split = 'all', withStubs = false, dataDir = MICRO_DATA } = {}) {
  const all = [...ALL_TASKS, ...(withStubs ? stubTasks(dataDir) : [])];
  const wanted = ids?.length ? all.filter((t) => ids.includes(t.id)) : all;

  if (split === 'tune') return wanted.filter((t) => !t.heldOut);

  if (split === 'heldout') return wanted.filter((t) => t.heldOut);

  return wanted;
}
