import type { Controller } from '../sim/engine';
import type { Method } from './router';
import type { SimModel } from '../sim/mjcfTypes';
import type { Contract } from './contract';
import type { ActionSpec, Environment, ObservationTerm } from './environment';
import { environmentHash } from './environment';
import { hashOf, isHash } from './hash';

export const SKILL_FORMAT = 'basecase-skill';
export const SKILL_VERSION = 1;
export const SKILL_STORE = 'library/skills';

export type Freshness = 'fresh' | 'rerun-arena' | 'needs-training';
export type ArenaVariant = 'held-out' | 'half-timestep' | 'latency';
export type SkillController = Exclude<Controller, { kind: 'limp' }>;

export interface ModelHashes {
  topology: string;
  physics: string;
  actuators: string;
}

export interface SkillBinding extends ModelHashes {
  design: string;
  contract: string;
  observation: string;
  action: string;
}

export interface ArenaVariantResult {
  variant: ArenaVariant;
  trials: number;
  passes: number;
  lowerBound: number;
  diverged: number;
  failures: Record<string, number>;
}

export interface ArenaEvidence {
  arenaVersion: number;
  binding: Pick<SkillBinding, 'contract' | 'physics' | 'actuators'> & { environment: string };
  confidence: number;
  bar: number;
  variants: ArenaVariantResult[];
  lowerBound: number;
  passed: boolean;
  conditions: string[];
  summary: string;
  saltCommitment: string;
}

export interface SkillOrigin {
  method: Method | 'motor-kit';
  cost: { wallS: number; steps: number };
}

export interface Skill {
  format: typeof SKILL_FORMAT;
  version: typeof SKILL_VERSION;
  name: string;
  binding: SkillBinding;
  observation: ObservationTerm[];
  action: ActionSpec;
  controller: SkillController;
  evidence: ArenaEvidence | null;
  warmStartFrom: string | null;
  origin?: SkillOrigin;
}

export interface CurrentDesign {
  design: string;
  contract: string;
  hashes: ModelHashes;
  observation: string;
  action: string;
}

const VISUAL_ELEMENTS = /<(light|camera)\b[^>]*\/>\s*|<visual>[\s\S]*?<\/visual>\s*/g;
const VISUAL_ATTRIBUTES = /\s(rgba|material|texture|texcoord|group)="[^"]*"/g;
const ACTUATOR_SECTION = /<actuator>[\s\S]*?<\/actuator>/;
const STRUCTURE_TAG = /<(body|freejoint|joint)\b([^>]*?)\/?>|<\/body>/g;
const ATTRIBUTE = (name: string) => new RegExp(`\\s${name}="([^"]*)"`);

const attribute = (attrs: string, name: string) => ATTRIBUTE(name).exec(attrs)?.[1] ?? '';

export const physicalXml = (xml: string) => xml.replace(VISUAL_ELEMENTS, '').replace(VISUAL_ATTRIBUTES, '');

function structure(xml: string): string[] {
  return [...xml.matchAll(STRUCTURE_TAG)].map(([whole, tag, attrs = '']) => {
    if (!tag) return '/body';

    if (tag === 'joint')
      return `joint ${attribute(attrs, 'name')} ${attribute(attrs, 'type')} ${attribute(attrs, 'axis')}`;

    return `${tag} ${attribute(attrs, 'name')}${whole.endsWith('/>') && tag === 'body' ? ' /' : ''}`;
  });
}

const actuatorKinds = (xml: string) =>
  [...(ACTUATOR_SECTION.exec(xml)?.[0] ?? '').matchAll(/<(\w+)\b[^>]*\sjoint="([^"]*)"/g)].map(
    ([, k, j]) => `${k} ${j}`,
  );

export function modelHashes(model: SimModel): ModelHashes {
  const xml = physicalXml(model.xml);
  const actuatorXml = ACTUATOR_SECTION.exec(xml)?.[0] ?? '';

  return {
    topology: hashOf({
      version: model.version,
      structure: structure(xml),
      actuators: actuatorKinds(xml),
      robots: model.robots.map((r) => ({
        key: r.key,
        floating: r.floating,
        morphology: r.morphology,
        joints: r.joints,
      })),
    }),
    physics: hashOf({ version: model.version, xml: xml.replace(ACTUATOR_SECTION, ''), initial: model.initial }),
    actuators: hashOf({
      version: model.version,
      xml: actuatorXml,
      joints: model.joints.map((j) => ({ id: j.id, effort: j.effort, drive: j.drive, actuator: j.actuator })),
    }),
  };
}

export const contractHash = (contract: Contract) => hashOf(contract);

export function currentDesign(options: { design: string; model: SimModel; environment: Environment }): CurrentDesign {
  const { design, model, environment } = options;

  return {
    design,
    contract: contractHash(environment.contract),
    hashes: modelHashes(model),
    observation: hashOf(environment.observation),
    action: hashOf(environment.action),
  };
}

export function bindingFor(current: CurrentDesign): SkillBinding {
  return {
    design: current.design,
    contract: current.contract,
    observation: current.observation,
    action: current.action,
    ...current.hashes,
  };
}

const needsTraining = (b: SkillBinding, c: CurrentDesign) =>
  b.design !== c.design || b.topology !== c.hashes.topology || b.observation !== c.observation || b.action !== c.action;

const evidenceMatches = (e: ArenaEvidence, b: SkillBinding) =>
  e.binding.contract === b.contract && e.binding.physics === b.physics && e.binding.actuators === b.actuators;

const bindingMatches = (b: SkillBinding, c: CurrentDesign) =>
  b.contract === c.contract && b.physics === c.hashes.physics && b.actuators === c.hashes.actuators;

export function skillFreshness(skill: Skill, current: CurrentDesign): Freshness {
  const { binding, evidence } = skill;

  if (needsTraining(binding, current)) return 'needs-training';

  if (!evidence || !evidenceMatches(evidence, binding) || !bindingMatches(binding, current)) return 'rerun-arena';

  return evidence.passed ? 'fresh' : 'needs-training';
}

export const skillHash = (skill: Skill) => hashOf(skill);

export interface WarmStart {
  from: string;
  controller: SkillController;
  binding: SkillBinding;
}

export function warmStart(skill: Skill, target: CurrentDesign): WarmStart {
  return { from: skillHash(skill), controller: skill.controller, binding: bindingFor(target) };
}

export function skillFromTraining(options: {
  name: string;
  start: WarmStart | null;
  current: CurrentDesign;
  environment: Environment;
  controller: SkillController;
}): Skill {
  const { name, start, current, environment, controller } = options;

  return {
    format: SKILL_FORMAT,
    version: SKILL_VERSION,
    name,
    binding: bindingFor(current),
    observation: environment.observation,
    action: environment.action,
    controller,
    evidence: null,
    warmStartFrom: start?.from ?? null,
  };
}

export function withEvidence(skill: Skill, evidence: ArenaEvidence, environment: Environment): Skill {
  const bound =
    evidenceMatches(evidence, skill.binding) && evidence.binding.environment === environmentHash(environment);

  if (!bound) throw new Error('This Arena run checked a different contract, model or environment.');

  return { ...skill, evidence };
}

export const skillFolder = (hash: string) => {
  if (!isHash(hash)) throw new Error('A skill folder is named by its hash.');

  return `${SKILL_STORE}/${hash}`;
};

export const skillFiles = (hash: string) => ({ skill: `${skillFolder(hash)}/skill.json` });
