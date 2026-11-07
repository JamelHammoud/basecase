import type { Scenario, ScenarioResult, TraceEvent } from '../../src/routines/scenarioTypes';

export const SENTENCE = 'Walk around. When you see someone, check their face and say hello, by name if you know them.';

const PERSON_AT = 6;
const SECONDS = 20;

export interface Acceptance {
  scenario: Scenario;
  judge: (r: ScenarioResult) => string[];
}

const scenario = (covers: string, rest: Partial<Scenario>): Scenario => ({
  covers,
  world: [],
  mocks: {},
  faults: [],
  seconds: SECONDS,
  expect: [],
  ...rest,
});

const personAt = (at: number) => [{ at, fact: 'person', value: true }];

const bodySkills = (trace: TraceEvent[], fromMs: number, untilMs: number) =>
  trace.filter((e) => e.kind === 'control' && e.t >= fromMs && e.t < untilMs).map((e) => e.skill ?? null);

function walksUntil(r: ScenarioResult, untilS: number): string[] {
  const first = r.trace.find((e) => e.kind === 'control' && e.skill === 'walk');

  if (!first || first.t > 1000) return ['It never started walking within 1 s.'];

  const other = bodySkills(r.trace, first.t + 1, untilS * 1000).filter((s) => s !== 'walk');

  return other.length ? [`It stopped walking before anyone came: ${other.join(', ')}.`] : [];
}

const saidFrom = (r: ScenarioResult, text: RegExp) => r.said.filter((s) => text.test(s));

function greetsByName(r: ScenarioResult): string[] {
  const problems = walksUntil(r, PERSON_AT);

  if (!saidFrom(r, /^Hello Maya$/).length) problems.push(`It never said "Hello Maya": ${JSON.stringify(r.said)}.`);

  return problems;
}

function greetsStranger(r: ScenarioResult): string[] {
  const problems = walksUntil(r, PERSON_AT);

  if (saidFrom(r, /Maya|Sam|Ana/).length) problems.push(`It named a stranger: ${JSON.stringify(r.said)}.`);

  if (!saidFrom(r, /^Hello$/).length) problems.push(`It never said "Hello": ${JSON.stringify(r.said)}.`);

  return problems;
}

function greetsNobody(r: ScenarioResult): string[] {
  const problems = walksUntil(r, SECONDS);

  if (saidFrom(r, /Hello/).length) problems.push(`It said hello to nobody: ${JSON.stringify(r.said)}.`);

  return problems;
}

function helloWhenFaceCheckFails(r: ScenarioResult): string[] {
  const problems = walksUntil(r, PERSON_AT);

  if (!saidFrom(r, /^Hello$/).length) problems.push(`A failed face check should still say "Hello".`);

  if (saidFrom(r, /Maya/).length) problems.push('It named someone the face check never matched.');

  return problems;
}

export const ACCEPTANCE: Acceptance[] = [
  {
    scenario: scenario('someone known walks up', { world: personAt(PERSON_AT), mocks: { recognize: 'known' } }),
    judge: greetsByName,
  },
  {
    scenario: scenario('a stranger walks up', { world: personAt(PERSON_AT), mocks: { recognize: 'unknown' } }),
    judge: greetsStranger,
  },
  { scenario: scenario('nobody comes', {}), judge: greetsNobody },
  {
    scenario: scenario('the face check fails', {
      world: personAt(PERSON_AT),
      faults: [{ node: 'recognize', at: 0, kind: 'fail' }],
    }),
    judge: helloWhenFaceCheckFails,
  },
];

export function acceptanceProblems(acceptance: Acceptance, result: ScenarioResult): string[] {
  const own = result.failures.map((f) => `Runner: ${f}`);

  return [...own, ...acceptance.judge(result)].map((p) => `${acceptance.scenario.covers}: ${p}`);
}
