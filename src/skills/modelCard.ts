import type { Skill } from './artifacts';
import { observationSize, type Environment, type ObservationTerm } from './environment';
import { bodyClassWords, type RobotSchema } from './robotSchema';
import { plural } from '../../electron/plural.mjs';

export interface ModelCardInput {
  skill: Skill;
  environment: Environment;
  schema: RobotSchema;
  robotName: string;
}

const termSize = (term: ObservationTerm, environment: Environment) =>
  observationSize({ observation: [term], action: environment.action });

function robotLines(schema: RobotSchema): string[] {
  const lengths = schema.limbs.map((_, i) => schema.joints.filter((j) => j.limb === i).length);
  const sizes = [...new Set(lengths)].sort((a, b) => a - b).join(' and ');
  const base = schema.floating ? 'floating base' : 'fixed base';

  return [
    `- Body class: ${bodyClassWords(schema.bodyClass)}, ${base}`,
    `- Joints: ${schema.joints.length}, in ${plural(schema.limbs.length, 'limb')} of ${sizes}`,
  ];
}

function observationLines(environment: Environment): string[] {
  return [
    '| Term | Values |',
    '|---|---|',
    ...environment.observation.map((term) => `| ${term.kind} | ${termSize(term, environment)} |`),
    '',
    `${observationSize(environment)} values in all.`,
  ];
}

function actionLines(environment: Environment): string[] {
  const { kind, joints, scale, controlDt } = environment.action;

  return [`${kind} on ${plural(joints.length, 'joint')}, scale ${scale}, every ${controlDt} s:`, '', joints.join(', ')];
}

function arenaLines(skill: Skill): string[] {
  const evidence = skill.evidence;

  if (!evidence) return [];

  return [
    evidence.summary,
    '',
    '| Run | Passed |',
    '|---|---|',
    ...evidence.variants.map((v) => `| ${v.variant} | ${v.passes} of ${v.trials} |`),
  ];
}

const FILES = [
  '- `skill.json`: the skill, its bindings and its controller',
  '- `contract.json` and `environment.json`: what Arena judged it on',
  '- `evidence.json`: what Arena found',
  '- `robot.json`: the joint layout Install Skill maps from',
];

const POLICY_FILES = ['- `policy.json`: the policy Basecase runs', '- `policy.onnx`: the same policy for ONNX Runtime'];

export function modelCard({ skill, environment, schema, robotName }: ModelCardInput): string {
  const policy = skill.controller.kind === 'policy' ? POLICY_FILES : [];

  return [
    '---',
    'library_name: basecase',
    'tags:',
    '  - robotics',
    '  - basecase',
    '---',
    '',
    `# ${skill.name} for ${robotName}`,
    '',
    'A Basecase skill, trained in simulation and passed by Arena on the robot above.',
    '',
    'To use it on another robot, press ⌘K in Basecase, choose **Install Skill** and paste this repo’s link. Basecase maps it onto that robot’s joints, trains it there and runs Arena again. The evidence below stays with this robot.',
    '',
    '## Robot',
    '',
    ...robotLines(schema),
    '',
    '## Observation',
    '',
    ...observationLines(environment),
    '',
    '## Action',
    '',
    ...actionLines(environment),
    '',
    '## Arena',
    '',
    ...arenaLines(skill),
    '',
    '## Files',
    '',
    ...FILES.slice(0, 1),
    ...policy,
    ...FILES.slice(1),
    '',
  ].join('\n');
}
