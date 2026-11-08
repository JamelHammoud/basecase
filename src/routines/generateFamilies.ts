import {
  apply,
  baseSkill,
  dedupe,
  emptySetup,
  model,
  reactionBody,
  scenario,
  secondsFor,
  type Setup,
  STOP_ALLOWANCE_MS,
  T0,
  trigger,
  triggerPeriodS,
} from './generateBuild';
import { baseFamilies } from './generateBase';
import { type Expected, stopViaOf } from './generateModel';
import { solve } from './generatePaths';
import type { Plan, PlanOp } from './planTypes';
import type { Expectation, Scenario } from './scenarioTypes';

const LATER_S = 0.5;
const OFF_AFTER_S = 0.6;

interface Run {
  setup: Setup;
  expected: Expected;
}

function defaultRun(plan: Plan, reaction: number, setup = emptySetup(), at = T0): Run | null {
  const started = trigger(plan, reaction, setup, at);

  return started && { setup: started, expected: model(plan, started, plan.reactions[reaction].entry) };
}

function guardedVisits(plan: Plan, expected: Expected): PlanOp[] {
  return expected.visits.flatMap((v) => plan.ops.filter((o) => o.node === v && o.kind !== 'if'));
}

const triggerFacts = (s: Setup) => new Set(s.world.map((w) => w.fact));

function switchOff(plan: Plan, reaction: number, setup: Setup, at: number): Setup | null {
  const off = solve({ plan, near: false }, plan.condSources[plan.reactions[reaction].when], false);

  return off && apply(plan, setup, off, at);
}

function preempt(plan: Plan, high: number, low: number): Scenario[] {
  const lowRun = defaultRun(plan, low);
  const first = lowRun && guardedVisits(plan, lowRun.expected)[0];
  const highRun = lowRun && defaultRun(plan, high, lowRun.setup, T0 + LATER_S);

  if (!lowRun || !first || !highRun || first.timeoutMs < 1000) return [];

  const overlap = [...triggerFacts(lowRun.setup)].some((f) =>
    triggerFacts(trigger(plan, high, emptySetup()) ?? emptySetup()).has(f),
  );

  if (overlap) return [];

  const setup = { ...highRun.setup, decisions: new Map([[first.node, 'timeout' as const]]) };
  const expected = model(plan, setup, plan.reactions[high].entry);
  const [h, l] = [plan.reactions[high], plan.reactions[low]];
  const lowSaid = first.kind === 'say' ? [plan.texts[first.text ?? 0]] : [];
  const expect: Expectation[] = [
    { event: 'preempted', reaction: l.id, count: 1 },
    { event: 'fired', reaction: h.id, count: 1 },
    { event: 'ended', reaction: h.id, why: expected.ended, count: 1 },
    { event: 'ended', reaction: l.id, count: 0 },
    { event: 'opCancel', node: first.node, count: 1 },
  ];

  if (lowSaid.every((t) => t.slots.length === 0)) {
    expect.push({ saidExactly: [...lowSaid.map((t) => t.template), ...expected.says] });
  }

  if (!l.stopFirst) expect.push({ skills: reactionBody(plan, high, expected) });

  return [scenario(`preempt ${l.id} with ${h.id}`, setup, secondsFor(expected, T0 + LATER_S), expect)];
}

function lowWhileHigh(plan: Plan, high: number, low: number): Scenario[] {
  const highRun = defaultRun(plan, high);
  const first = highRun && guardedVisits(plan, highRun.expected)[0];
  const both = highRun && defaultRun(plan, low, highRun.setup, T0 + LATER_S);

  if (!highRun || !first || !both || first.timeoutMs < 1000) return [];

  const [h, l] = [plan.reactions[high], plan.reactions[low]];
  const queued = l.retrigger === 2;
  const setup = { ...both.setup, decisions: new Map([[first.node, 'timeout' as const]]) };
  const expect: Expectation[] = [
    { event: 'fired', reaction: h.id, count: 1 },
    queued
      ? { event: 'queued', reaction: l.id, count: 1 }
      : { event: 'dropped', reaction: l.id, why: 'busy', count: 1 },
    { event: 'fired', reaction: l.id, count: queued ? 1 : 0 },
  ];
  const seconds = Math.ceil(T0 + (STOP_ALLOWANCE_MS + first.timeoutMs + both.expected.durationMs) / 1000 + 4);

  return [scenario(`${l.id} waits while ${h.id} runs`, setup, seconds, expect)];
}

function cooldowns(plan: Plan, reaction: number): Scenario[] {
  const r = plan.reactions[reaction];
  const run = defaultRun(plan, reaction);
  const off = run && switchOff(plan, reaction, run.setup, T0 + OFF_AFTER_S);
  const cooldownS = r.cooldownMs / 1000;
  const runS = run ? (run.expected.durationMs + STOP_ALLOWANCE_MS) / 1000 : Infinity;
  const out: Scenario[] = [];

  if (!off || cooldownS < 1.5) return out;

  const blockAt = T0 + cooldownS - LATER_S;
  const blocked = trigger(plan, reaction, off, blockAt);

  if (blocked) {
    out.push(
      scenario(`${r.id}: cooldown holds`, blocked, Math.ceil(blockAt + 2), [
        { event: 'fired', reaction: r.id, count: 1 },
        { event: 'dropped', reaction: r.id, why: 'cooldown', count: 1 },
      ]),
    );
  }

  const againAt = T0 + cooldownS + LATER_S;
  const again = runS < cooldownS ? trigger(plan, reaction, off, againAt) : null;
  const period = triggerPeriodS(plan, reaction);

  if (again) {
    out.push(
      scenario(`${r.id}: fires again after its cooldown`, again, Math.ceil(againAt + runS + 3), [
        { event: 'fired', reaction: r.id, count: 2 },
        { event: 'fired', reaction: r.id, from: againAt, until: againAt + period + 0.06, count: 1 },
      ]),
    );
  }

  return out;
}

const RETRIGGER_EXPECT: Record<number, (id: string) => Expectation[]> = {
  0: (id) => [
    { event: 'fired', reaction: id, count: 1 },
    { event: 'dropped', reaction: id, why: 'retrigger', count: 1 },
  ],
  1: (id) => [
    { event: 'restarted', reaction: id, count: 1 },
    { event: 'fired', reaction: id, count: 2 },
  ],
  2: (id) => [
    { event: 'queued', reaction: id, count: 1 },
    { event: 'fired', reaction: id, count: 2 },
  ],
};

function retrigger(plan: Plan, reaction: number): Scenario[] {
  const r = plan.reactions[reaction];
  const run = defaultRun(plan, reaction);
  const ops = run ? guardedVisits(plan, run.expected) : [];
  const longest = [...ops].sort((a, b) => b.timeoutMs - a.timeoutMs)[0];

  if (!run || !longest) return [];

  const againAt = T0 + r.cooldownMs / 1000 + LATER_S;
  const hungUntil = T0 + ((run.expected.startMs.get(longest.node) ?? 0) + longest.timeoutMs) / 1000;
  const off = switchOff(plan, reaction, run.setup, T0 + OFF_AFTER_S);
  const again = off && againAt + 0.3 < hungUntil ? trigger(plan, reaction, off, againAt) : null;

  if (!again) return [];

  const setup = { ...again, decisions: new Map([[longest.node, 'timeout' as const]]) };
  const seconds = Math.ceil(againAt + (longest.timeoutMs + run.expected.durationMs + STOP_ALLOWANCE_MS) / 1000 + 3);

  return [scenario(`${r.id}: seen again while running`, setup, seconds, RETRIGGER_EXPECT[r.retrigger](r.id))];
}

function staleWatchers(plan: Plan): Scenario[] {
  const stopAt = 2;

  return plan.watchers
    .filter((w) => w.when < 0)
    .map((w) => {
      const period = 1 / w.rateHz;
      const staleAt = stopAt + w.maxAgeMs / 1000;
      const setup = { ...emptySetup(), faults: [{ node: w.id, at: stopAt, kind: 'hang' as const }] };

      return scenario(`watcher ${w.id} stops answering`, setup, Math.ceil(staleAt + 2), [
        { event: 'fresh', fact: w.id, count: 1 },
        { event: 'stale', fact: w.id, from: staleAt - period - 0.05, until: staleAt + 0.06, count: 1 },
      ]);
    });
}

function stopFailures(plan: Plan): Scenario[] {
  const reaction = plan.reactions.findIndex((r) => r.stopFirst);
  const base = baseSkill(plan);
  const hub = stopViaOf(plan, base);
  const safe = plan.skills[plan.safeStop]?.id ?? hub;
  const started = reaction >= 0 ? trigger(plan, reaction, emptySetup()) : null;

  if (!started) return [];

  const stopS = plan.stopTimeoutMs / 1000;
  const hubHang = { ...started, faults: [{ node: hub, at: 0, kind: 'hang' as const }] };
  const baseHang = { ...started, faults: [{ node: plan.base.node, at: 0, kind: 'hang' as const }] };
  const phased = plan.skills[plan.base.skill]?.interrupt === 1;
  const expect = (body: string[], lateS: number): Expectation[] => [
    { event: 'safeStop', why: 'stop timed out', from: T0 + stopS, until: T0 + lateS + stopS + 0.2, count: 1 },
    { saidExactly: [] },
    { skills: dedupe(body) },
  ];
  const out = [scenario(`${hub} never finishes`, hubHang, Math.ceil(T0 + stopS + 3), expect([base, hub, safe], 0.6))];

  if (phased) {
    out.push(scenario(`${base} never reaches a phase`, baseHang, Math.ceil(T0 + stopS + 3), expect([base, safe], 0.1)));
  }

  return out;
}

function coordinatorHang(plan: Plan): Scenario {
  const at = Math.min(5, plan.base.timeoutMs / 2000);
  const deadline = plan.controlDeadlineMs / 1000;
  const base = baseSkill(plan);
  const safe = plan.skills[plan.safeStop]?.id ?? base;
  const setup = { ...emptySetup(), faults: [{ node: 'coordinator', at, kind: 'hang' as const }] };

  return scenario('coordinator hangs', setup, at + 3, [
    { event: 'tripped', from: at + deadline - 0.06, until: at + deadline + 0.1, count: 1 },
    { always: { skill: base }, until: at + deadline - 0.1 },
    { skills: dedupe([base, safe]) },
  ]);
}

export function extraFamilies(plan: Plan): Scenario[] {
  const n = plan.reactions.length;
  const pairs = [...Array(n).keys()].flatMap((a) => [...Array(n).keys()].filter((b) => b > a).map((b) => [a, b]));

  return [
    ...pairs.flatMap(([a, b]) => [...preempt(plan, a, b), ...lowWhileHigh(plan, a, b)]),
    ...plan.reactions.flatMap((_, i) => [...cooldowns(plan, i), ...retrigger(plan, i)]),
    ...staleWatchers(plan),
    ...baseFamilies(plan),
    ...stopFailures(plan),
    coordinatorHang(plan),
  ];
}
