import { isPolicySpec } from '../sim/policy';
import { SKILL_FORMAT, SKILL_VERSION, type Skill, type SkillBinding } from './artifacts';
import { isHash } from './hash';

const BINDING_HASHES: Array<Exclude<keyof SkillBinding, 'design'>> = [
  'contract',
  'physics',
  'actuators',
  'topology',
  'observation',
  'action',
];

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function isBinding(value: unknown): value is SkillBinding {
  return isObject(value) && typeof value.design === 'string' && BINDING_HASHES.every((k) => isHash(value[k]));
}

function isController(value: unknown): boolean {
  if (!isObject(value)) return false;

  if (value.kind === 'policy') return isPolicySpec(value.policy) && typeof value.robot === 'string';

  if (value.kind === 'hold') return value.values === undefined || isObject(value.values);

  return value.kind === 'animation' && isObject(value.animation);
}

function isEvidence(value: unknown): boolean {
  return (
    value === null ||
    (isObject(value) &&
      typeof value.passed === 'boolean' &&
      typeof value.summary === 'string' &&
      Array.isArray(value.variants) &&
      isObject(value.binding))
  );
}

export function isSkill(value: unknown): value is Skill {
  return (
    isObject(value) &&
    value.format === SKILL_FORMAT &&
    value.version === SKILL_VERSION &&
    typeof value.name === 'string' &&
    isBinding(value.binding) &&
    Array.isArray(value.observation) &&
    isObject(value.action) &&
    isController(value.controller) &&
    isEvidence(value.evidence) &&
    (value.warmStartFrom === null || isHash(value.warmStartFrom))
  );
}

export function readSkillBundle(value: unknown): Skill[] | undefined {
  if (!Array.isArray(value)) return undefined;

  return value.filter(isSkill);
}
