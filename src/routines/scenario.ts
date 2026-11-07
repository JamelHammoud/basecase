import { CoordinatorRun } from './coordinator';
import type { Plan } from './planTypes';
import { checkExpectations, invariants } from './scenarioChecks';
import { ORDER, VirtualClock } from './scenarioClock';
import { ScenarioHost } from './scenarioHost';
import { activeFault, CONTROL_PERIOD_MS, COORDINATOR_PERIOD_MS } from './scenarioMocks';
import type { Scenario, ScenarioResult } from './scenarioTypes';
import { TraceDecoder } from './traceDecode';

export type * from './scenarioTypes';

const planJson = new WeakMap<Plan, string>();

function jsonOf(plan: Plan): string {
  let json = planJson.get(plan);

  if (json === undefined) {
    json = JSON.stringify(plan);
    planJson.set(plan, json);
  }

  return json;
}

function unknownTargets(plan: Plan, scenario: Scenario): string[] {
  const names = new Set([
    'coordinator',
    ...plan.ops.map((o) => o.node),
    ...plan.ops.flatMap((o) => (o.model ? [o.model] : [])),
    ...plan.skills.map((s) => s.id),
    ...plan.watchers.map((w) => w.id),
    plan.base.node,
  ]);

  return scenario.faults.filter((f) => !names.has(f.node)).map((f) => `No node called ${f.node} to fault`);
}

class ControlTier {
  ticks = 0;
  maxGapMs = 0;
  private last = -1;
  private body = -1;
  private head = -1;
  private tripped = false;

  private readonly run: CoordinatorRun;
  private readonly host: ScenarioHost;
  private readonly decoder: TraceDecoder;

  constructor(run: CoordinatorRun, host: ScenarioHost, decoder: TraceDecoder) {
    this.run = run;
    this.host = host;
    this.decoder = decoder;
  }

  tick(t: number) {
    const read = this.run.control(t);

    if (this.last >= 0) this.maxGapMs = Math.max(this.maxGapMs, t - this.last);

    this.last = t;
    this.ticks += 1;

    if (read.body !== this.body || read.head !== this.head) {
      this.body = read.body;
      this.head = read.head;
      this.host.record({
        t,
        kind: 'control',
        skill: this.decoder.skill(read.body),
        head: this.decoder.skill(read.head),
      });
    }

    if (read.tripped && !this.tripped) this.host.record({ t, kind: 'tripped' });

    this.tripped = read.tripped;
  }
}

function schedule(plan: Plan, scenario: Scenario, run: CoordinatorRun, clock: VirtualClock) {
  const host = new ScenarioHost(plan, scenario, run, clock);
  const control = new ControlTier(run, host, new TraceDecoder(plan, host.symbols));

  plan.watchers.forEach((w, i) => clock.every(1000 / w.rateHz, ORDER.watcher, (t) => host.sample(w, i, t)));
  clock.every(COORDINATOR_PERIOD_MS, ORDER.coordinator, (t) => {
    if (activeFault(scenario.faults, ['coordinator'], t)?.kind !== 'hang') host.handle(run.tick(t));
  });
  clock.every(CONTROL_PERIOD_MS, ORDER.control, (t) => control.tick(t));

  return { host, control };
}

export async function runScenario(plan: Plan, scenario: Scenario): Promise<ScenarioResult> {
  const run = await CoordinatorRun.start(jsonOf(plan));
  const clock = new VirtualClock();
  const { host, control } = schedule(plan, scenario, run, clock);

  clock.runUntil(scenario.seconds * 1000);

  const record = { scenario, trace: host.trace, said: host.said, maxControlGapMs: control.maxGapMs };
  const failures = [...unknownTargets(plan, scenario), ...invariants(record), ...checkExpectations(record)];

  return {
    passed: failures.length === 0,
    trace: host.trace,
    said: host.said,
    maxControlGapMs: control.maxGapMs,
    controlTicks: control.ticks,
    failures,
  };
}
