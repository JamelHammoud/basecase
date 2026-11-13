import { runAgent } from '../lib/agent.mjs';
import { createIssue, issues } from '../lib/github.mjs';
import { IDEA, takenTitles, titleKey } from '../lib/ideas.mjs';
import { HOME_CHECKOUT } from '../lib/paths.mjs';
import { store } from '../lib/store.mjs';

export const schedule = {
  agent: true,
  slots: 1,
  everySeconds: 60,
  labels: ['loop:idea', 'loop:big-bet'],
  does: 'Takes one stage of the robotics loop, or new directions beyond it, per run and files big bets and features for a first robot and a thousandth',
};

export const STAGES = [
  {
    name: 'First robot',
    focus: 'the first robot, end to end: from opening Basecase for the first time to a robot that moves',
  },
  { name: 'Design', focus: 'Design: drawing the robot, parts, sketching, sculpting, importing and the CAD agent' },
  { name: 'Engineer', focus: 'Engineer: checks, joints, kinematics, motors, power and whether it can be assembled' },
  { name: 'Simulate', focus: 'Simulate: physics, Cases, worlds, sensors and seeing what the robot will do' },
  { name: 'Train', focus: 'Train: tasks, skills, training runs, policies and datasets' },
  { name: 'Build', focus: 'Build: the bill of materials, sourcing, printing and the build guide' },
  {
    name: 'Operate',
    focus: 'Operate: the real robot, calibration, live driving, recording and closing the loop back to sim',
  },
  {
    name: 'New directions',
    focus:
      'new directions beyond the six stages: what Basecase could become next, such as new sub-products, new surfaces (phone, web, hardware), cloud services, community and sharing, marketplaces, education, business models, and what to remove. Return only big bets this run',
  },
];

export const BIG_BET = 'loop:big-bet';

const MAX_WAITING = 12;

const rotation = store('lanes', { next: 0 });

const SCHEMA = {
  type: 'object',
  properties: {
    ideas: {
      type: 'array',
      maxItems: 3,
      items: {
        type: 'object',
        properties: {
          title: { type: 'string', maxLength: 80 },
          scale: { type: 'string', enum: ['big bet', 'feature'] },
          for: { type: 'string', enum: ['first robot', 'thousandth robot', 'both'] },
          moment: { type: 'string' },
          bestToday: { type: 'string' },
          basecaseToday: { type: 'string' },
          firstStep: { type: 'string' },
        },
        required: ['title', 'scale', 'for', 'moment', 'bestToday', 'basecaseToday', 'firstStep'],
      },
    },
    notes: { type: 'string' },
  },
  required: ['ideas', 'notes'],
};

const FOR = {
  'first robot': 'Someone designing their first robot',
  'thousandth robot': 'Someone building their thousandth robot',
  both: 'Both the first robot and the thousandth',
};

export const ideaBody = (idea, stage) =>
  [
    `**Scale:** ${idea.scale === 'big bet' ? 'Big bet' : 'Feature'}`,
    `**Stage:** ${stage}`,
    `**For:** ${FOR[idea.for]}`,
    `**The moment:** ${idea.moment}`,
    `**Best today:** ${idea.bestToday}`,
    `**Basecase today:** ${idea.basecaseToday}`,
    `**${idea.scale === 'big bet' ? 'Why now, and the first steps' : 'First step'}:** ${idea.firstStep}`,
  ].join('\n\n');

export const labelsFor = (idea) => (idea.scale === 'big bet' ? [IDEA, BIG_BET] : [IDEA]);

export const freshIdeas = (ideas, taken) => {
  const seen = new Set(taken.map(titleKey));

  return ideas.filter((idea) => {
    const key = titleKey(idea.title);
    const fresh = !seen.has(key);

    seen.add(key);

    return fresh;
  });
};

const prompt = (stage, taken) =>
  [
    `Today is ${new Date().toISOString().slice(0, 10)}. This run's part of the loop: ${stage}.`,
    `## Ideas and steps already open\n\n${taken.map((title) => `- ${title}`).join('\n') || 'None.'}`,
  ].join('\n\n');

const SANDBOX = {
  tools: ['Read', 'Grep', 'Glob', 'WebFetch', 'WebSearch'],
  allow: ['Read', 'Grep', 'Glob', 'WebFetch', 'WebSearch'],
};

export default function ideas({ log }) {
  const waiting = issues(IDEA).length;

  if (waiting >= MAX_WAITING) {
    log(`${waiting} ideas wait for the lead; not adding more`);

    return;
  }

  const { next } = rotation.get('ideas');
  const stage = STAGES[next % STAGES.length];
  const taken = takenTitles();
  const result = runAgent({
    cwd: HOME_CHECKOUT,
    name: 'ideas',
    prompt: prompt(stage.focus, taken),
    schema: SCHEMA,
    hours: 2,
    sandbox: SANDBOX,
  });

  rotation.save('ideas', { next: next + 1 });

  if (!result.ok) {
    log(`ideas session failed: ${String(result.error).slice(0, 400)}`);

    return;
  }

  for (const idea of freshIdeas(result.output.ideas, taken)) {
    log(
      `${stage.name}: ${createIssue({ title: idea.title, body: ideaBody(idea, stage.name), labels: labelsFor(idea) })}`,
    );
  }

  if (result.output.notes) log(`notes: ${result.output.notes}`);
}
