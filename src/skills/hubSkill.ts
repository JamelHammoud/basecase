import { SKILL_DOWNLOADS, SKILL_FILE_BYTES } from '../../electron/hub/skillRepo.mjs';
import type { SimModel } from '../sim/mjcfTypes';
import type { PolicySpec } from '../sim/policy';
import { hubLink } from '../utils/robotImport/hub';
import { contractHash, skillHash, type Skill } from './artifacts';
import { isSkill } from './bundle';
import { environmentHash, type Environment } from './environment';
import { hashOf } from './hash';
import { LEGGED_ENTRIES, type TrainedEntry } from './kitEnvironment';
import { kitJob } from './kitJob';
import { kitRobot } from './kitModel';
import { modelCard } from './modelCard';
import { kitEntries, kitSkillName, type KitWarm } from './motorKit';
import { isRunnablePolicy } from './policyCheck';
import { mappedPolicy } from './policyMap';
import { isRobotSchema, jointMap, robotSchema, type RobotSchema } from './robotSchema';

export interface PublishInput {
  skill: Skill;
  environment: Environment;
  model: SimModel;
}

export interface PublishedSkill {
  skill: Skill & { controller: { kind: 'policy'; policy: PolicySpec } };
  environment: Environment;
  schema: RobotSchema;
}

export interface InstallPlan {
  entry: TrainedEntry;
  warm: KitWarm;
}

const REPO_NAME_MAX = 96;

const slug = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

const encoded = (text: string) => new TextEncoder().encode(text);

const pretty = (value: unknown) => encoded(`${JSON.stringify(value, null, 2)}\n`);

export function skillRepoName(skill: Skill, model: SimModel): string {
  const stem = [slug(model.robots[0]?.name ?? ''), slug(skill.name)].filter(Boolean).join('-') || 'skill';

  return `${stem.slice(0, REPO_NAME_MAX - 7).replace(/-$/, '')}-${skillHash(skill).slice(0, 6)}`;
}

export function publishedSkillFiles({ skill, environment, model }: PublishInput): Record<string, Uint8Array> {
  if (!skill.evidence?.passed) throw new Error('Only a skill that passed Arena can be published.');

  if (environmentHash(environment) !== skill.evidence.binding.environment)
    throw new Error('This skill’s environment changed since Arena checked it.');

  const schema = robotSchema(model, { robot: environment.robot, joints: environment.action.joints });
  const robotName = model.robots.find((r) => r.key === environment.robot)?.name ?? environment.robot;
  const policy: Record<string, Uint8Array> =
    skill.controller.kind === 'policy' ? { 'policy.json': encoded(JSON.stringify(skill.controller.policy)) } : {};

  return {
    'README.md': encoded(modelCard({ skill, environment, schema, robotName })),
    'skill.json': encoded(JSON.stringify(skill)),
    ...policy,
    'contract.json': pretty(environment.contract),
    'environment.json': pretty(environment),
    'evidence.json': pretty(skill.evidence),
    'robot.json': pretty(schema),
  };
}

export function skillLink(url: string) {
  const link = hubLink(url);

  if (!link || link.kind !== 'models') throw new Error('Paste the link to a model repo on Hugging Face.');

  return { owner: link.owner, repo: link.repo, rev: link.rev };
}

function parsedFile(files: Record<string, unknown>, path: string): unknown {
  const text = files[path];

  if (typeof text !== 'string') throw new Error(`The repo has no ${path}.`);

  if (text.length > SKILL_FILE_BYTES) throw new Error(`${path} is too large.`);

  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${path} isn’t JSON.`);
  }
}

const sameList = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((v, i) => v === b[i]);

function environmentMatches(environment: unknown, skill: Skill): environment is Environment {
  const env = environment as Environment;

  return (
    !!env &&
    typeof env === 'object' &&
    environmentHash(env) === skill.evidence?.binding.environment &&
    contractHash(env.contract) === skill.binding.contract &&
    hashOf(env.observation) === skill.binding.observation &&
    hashOf(env.action) === skill.binding.action
  );
}

function checkedSkill(value: unknown): PublishedSkill['skill'] {
  if (!isSkill(value)) throw new Error('skill.json isn’t a Basecase skill.');

  if (value.controller.kind !== 'policy' || !isRunnablePolicy(value.controller.policy))
    throw new Error('Only a skill that runs a policy can be installed.');

  if (!value.evidence?.passed) throw new Error('This skill never passed Arena.');

  return value as PublishedSkill['skill'];
}

export function readPublishedSkill(files: Record<string, unknown>): PublishedSkill {
  const [skillFile, ...rest] = SKILL_DOWNLOADS;
  const skill = checkedSkill(parsedFile(files, skillFile));
  const read = Object.fromEntries(rest.map((path) => [path, parsedFile(files, path)]));
  const schema = read['robot.json'];
  const checks: Array<[string, boolean]> = [
    ['policy.json', hashOf(read['policy.json']) === hashOf(skill.controller.policy)],
    ['contract.json', hashOf(read['contract.json']) === skill.binding.contract],
    ['environment.json', environmentMatches(read['environment.json'], skill)],
    ['evidence.json', hashOf(read['evidence.json']) === hashOf(skill.evidence)],
    [
      'robot.json',
      isRobotSchema(schema) &&
        sameList(
          schema.joints.map((j) => j.id),
          skill.action.joints,
        ),
    ],
  ];
  const wrong = checks.find(([, ok]) => !ok);

  if (wrong) throw new Error(`${wrong[0]} doesn’t match skill.json.`);

  return { skill, environment: read['environment.json'] as Environment, schema: schema as RobotSchema };
}

function kitEntryOf(skill: Skill): TrainedEntry {
  const entry = LEGGED_ENTRIES.find((e) => kitSkillName(e) === skill.name);

  if (!entry || skill.origin?.method !== 'motor-kit')
    throw new Error('Install Skill takes Motor Kit skills: Stand, Walk, Get up and Settle.');

  return entry;
}

export function installPlan(published: PublishedSkill, model: SimModel): InstallPlan {
  const entry = kitEntryOf(published.skill);
  const robot = kitRobot(model);
  const mapped = jointMap(published.schema, robotSchema(model, { robot: robot.key, joints: robot.joints }));

  if (!mapped.ok) throw new Error(mapped.problem);

  if (!kitEntries(model).includes(entry)) throw new Error('The Motor Kit trains robots that walk on legs.');

  const job = kitJob(model, entry, { minutes: 1, seed: 1 });
  const policy = mappedPolicy(published.skill.controller.policy, mapped.map, {
    joints: job.joints.map((j) => j.id),
    defaultPose: job.defaultPose,
  });

  return { entry, warm: { from: skillHash(published.skill), policy } };
}
