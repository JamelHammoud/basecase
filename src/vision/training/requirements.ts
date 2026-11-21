import type { TrainingTask } from './types';
import type { TrainingRequirement } from './requirementTypes';

export const MAX_REQUIREMENTS = 16;

const unit = (value: number) => Number.isFinite(value) && value >= 0 && value <= 1;

function validGroup(group: TrainingRequirement['group']) {
  return (
    group &&
    ['condition', 'camera'].includes(group.kind) &&
    typeof group.name === 'string' &&
    !!group.name.trim() &&
    group.name === group.name.trim() &&
    group.name.length <= (group.kind === 'condition' ? 64 : 200) &&
    [...group.name].every((character) => character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127)
  );
}

function validClass(value: TrainingRequirement, task: TrainingTask) {
  if (value.classId === undefined) return value.className === undefined;

  return task.classes.some(
    (category) => category.id === value.classId && (value.className === undefined || category.name === value.className),
  );
}

function checkedRequirement(value: TrainingRequirement, task: TrainingTask): TrainingRequirement {
  if (
    !value ||
    !validGroup(value.group) ||
    value.metric !== task.metric ||
    !validClass(value, task) ||
    !unit(value.minScore) ||
    !unit(value.maxRegression) ||
    !Number.isSafeInteger(value.minRealTest) ||
    value.minRealTest < 1 ||
    value.minRealTest > 1000
  )
    throw new Error('Choose a task metric, an existing class and bounded requirement thresholds.');

  return {
    group: { kind: value.group.kind, name: value.group.name },
    ...(value.classId === undefined ? {} : { classId: value.classId }),
    ...(value.classId === undefined
      ? {}
      : { className: task.classes.find((category) => category.id === value.classId)!.name }),
    metric: value.metric,
    minScore: value.minScore,
    minRealTest: value.minRealTest,
    maxRegression: value.maxRegression,
  };
}

export function canonicalRequirements(values: TrainingRequirement[] = [], task: TrainingTask): TrainingRequirement[] {
  if (!Array.isArray(values) || values.length > MAX_REQUIREMENTS)
    throw new Error('Declare at most 16 operating requirements.');

  const checked = values.map((value) => checkedRequirement(value, task));
  const keys = checked.map((value) => JSON.stringify([value.group, value.classId]));

  if (new Set(keys).size !== keys.length) throw new Error('Declare each group and class requirement once.');

  return checked.sort((a, b) =>
    JSON.stringify(a) < JSON.stringify(b) ? -1 : Number(JSON.stringify(a) > JSON.stringify(b)),
  );
}
