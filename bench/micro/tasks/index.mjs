import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ASSEMBLY_TASKS } from './assembly.mjs';
import { COST_TASKS, SERVICE_TASKS } from './serviceCost.mjs';
import { CRAFT_TASKS, INTEGRITY_TASKS, MIRROR_TASKS } from './quality.mjs';
import { allOf, pending } from '../checks.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));

export const MICRO_DATA = path.resolve(here, '../../data/micro');

export const SEED_TASKS = [
  ...ASSEMBLY_TASKS,
  ...SERVICE_TASKS,
  ...COST_TASKS,
  ...INTEGRITY_TASKS,
  ...CRAFT_TASKS,
  ...MIRROR_TASKS,
];

export function realScenePath(name, dataDir = MICRO_DATA) {
  return name ? path.join(dataDir, 'scenes', `${name}.json`) : null;
}

export function hasRealScene(task, dataDir = MICRO_DATA) {
  const file = realScenePath(task.realScene, dataDir);

  return !!file && fs.existsSync(file);
}

function stubTask(dir, file) {
  const stub = JSON.parse(fs.readFileSync(file, 'utf8'));

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

export function stubTasks(dataDir = MICRO_DATA) {
  const stubsDir = path.join(dataDir, 'stubs');

  if (!fs.existsSync(stubsDir)) return [];

  return fs
    .readdirSync(stubsDir)
    .map((d) => path.join(stubsDir, d))
    .filter((d) => fs.existsSync(path.join(d, 'task.json')))
    .map((d) => stubTask(d, path.join(d, 'task.json')));
}

export function startSceneFile(task, dataDir = MICRO_DATA) {
  if (task.startFile) return task.startFile;

  return hasRealScene(task, dataDir) ? realScenePath(task.realScene, dataDir) : null;
}

export function runnable(task, dataDir = MICRO_DATA) {
  return !task.disabled && !!(task.fixture || startSceneFile(task, dataDir));
}

export function selectTasks({ ids, split = 'all', withStubs = false, dataDir = MICRO_DATA } = {}) {
  const all = [...SEED_TASKS, ...(withStubs ? stubTasks(dataDir) : [])];
  const wanted = ids?.length ? all.filter((t) => ids.includes(t.id)) : all;

  if (split === 'tune') return wanted.filter((t) => !t.heldOut);

  if (split === 'heldout') return wanted.filter((t) => t.heldOut);

  return wanted;
}
