import { Symbols } from './symbols';
import type { RoutineVisionFacts } from './visionFacts';
import type { CoordinatorRun, RawEvent } from './coordinator';
import type { Plan, PlanOp, PlanWatcher } from './planTypes';
import type { Motion } from './schema';
import { ORDER, type VirtualClock } from './scenarioClock';
import {
  activeFault,
  ASK_MS,
  askAnswer,
  INFER_MS,
  inferResult,
  mockLatency,
  PHASE_MS,
  sayMs,
  SKILL_MS,
  SLOW_FACTOR,
  worldNum,
} from './scenarioMocks';
import type { Fault, Scenario, TraceEvent } from './scenarioTypes';
import { type FactValue, renderText, TraceDecoder } from './traceDecode';

type Reply = (ok: boolean) => void;

export type FactFeed = (fact: string, atMs: number) => { value: boolean | number | string; at: number } | undefined;

export interface MotionHost {
  startMove: (move: { token: number; skill: string; move: Motion }, finish: Reply) => void;
}

export class ScenarioHost {
  readonly trace: TraceEvent[] = [];
  readonly said: string[] = [];
  readonly values = new Map<number, FactValue>();
  readonly symbols: string[];
  skillLatency: (skill: string) => number = () => SKILL_MS;
  motion: MotionHost | null = null;
  feed: FactFeed | null = null;
  vision: RoutineVisionFacts | null = null;
  private readonly decoder: TraceDecoder;
  private readonly symbolTable: Symbols;
  private readonly visionWaits = new Map<number, () => void>();
  private readonly cancelled = new Set<number>();
  private readonly doNodes = new Map<number, string>();
  private readonly doMoves = new Map<number, Motion>();
  private readonly baseSkill: string;

  private readonly plan: Plan;
  private readonly scenario: Scenario;
  private readonly run: CoordinatorRun;
  private readonly clock: VirtualClock;

  constructor(plan: Plan, scenario: Scenario, run: CoordinatorRun, clock: VirtualClock) {
    this.plan = plan;
    this.scenario = scenario;
    this.run = run;
    this.clock = clock;
    this.symbolTable = new Symbols(plan.symbols);
    this.symbols = this.symbolTable.list;
    this.decoder = new TraceDecoder(plan, this.symbols);
    this.baseSkill = plan.skills[plan.base.skill]?.id ?? '';
  }

  intern(name: string): number {
    return this.symbolTable.id(name);
  }

  record(event: TraceEvent) {
    this.trace.push(event);
  }

  isCancelled(token: number): boolean {
    return this.cancelled.has(token);
  }

  private fault(names: string[], atMs: number): Fault | undefined {
    return activeFault(this.scenario.faults, names, atMs);
  }

  worldValue(fact: string, atMs: number): boolean | number | string | undefined {
    let latest: { at: number; value: boolean | number | string } | undefined;

    for (const change of this.scenario.world) {
      const applies = change.fact === fact && change.at * 1000 <= atMs && change.at >= (latest?.at ?? -Infinity);

      if (applies) latest = change;
    }

    return latest?.value;
  }

  private reading(fact: string, t: number): { value: boolean | number | string; at: number } {
    const fed = this.feed?.(fact, t);

    if (fed) return fed;

    const mock = this.scenario.mocks[fact];

    return { value: (typeof mock === 'object' ? mock.value : mock) ?? this.worldValue(fact, t) ?? false, at: t };
  }

  sample(watcher: PlanWatcher, index: number, t: number) {
    const enabled = (this.run.watchers() >>> index) & 1;
    const fault = this.fault([watcher.id], t);

    if (!enabled || fault?.kind === 'hang' || fault?.kind === 'fail') return;

    if (this.vision?.handles(watcher.model)) return this.sampleVision(watcher, t);

    const { value: raw, at } = this.reading(watcher.id, t);
    const value = { num: worldNum(raw), sym: typeof raw === 'string' ? this.intern(raw) : -1 };

    if (fault?.kind === 'garbage') value.num = Number.NaN;

    if (this.run.publish(watcher.fact, value, Math.floor(at))) {
      this.values.set(watcher.fact, { num: value.num, name: typeof raw === 'string' ? raw : null });
    }
  }

  private sampleVision(watcher: PlanWatcher, t: number) {
    const reading = this.vision?.read(watcher, t);

    if (!reading) return;

    this.run.publish(watcher.fact, { num: reading.num, sym: -1 }, Math.floor(reading.at));
    this.values.set(watcher.fact, reading);
  }

  handle(events: RawEvent[]) {
    for (const raw of events) {
      const event = this.decoder.decode(raw);

      this.record(event);

      if (raw.k === 'run') this.onRun(event, raw.t);
      else if (raw.k === 'opStart') this.onOpStart(this.plan.ops[raw.a], event, raw.t);
      else if (['opCancel', 'opTimeout', 'opFail', 'opDone', 'release'].includes(raw.k))
        this.cancel(event.token ?? raw.b);
    }
  }

  private cancel(token: number) {
    this.cancelled.add(token);
    this.visionWaits.get(token)?.();
    this.visionWaits.delete(token);
  }

  private schedule(token: number, atMs: number, reply: Reply, ok = true) {
    this.clock.at(atMs, ORDER.reply, () => {
      if (!this.cancelled.has(token)) reply(ok);
    });
  }

  private settle(names: string[], start: number, latency: number, finish: Reply & { token?: number }) {
    const token = finish.token ?? 0;
    const natural = start + latency;
    const fault = this.fault(names, natural);

    if (!fault) return this.schedule(token, natural, finish);

    if (fault.kind === 'slow') return this.schedule(token, start + latency * SLOW_FACTOR, finish);

    if (fault.kind === 'fail') return this.schedule(token, Math.max(start, fault.at * 1000), finish, false);

    if (fault.kind === 'garbage') this.schedule(token, natural, finish, false);
  }

  private onRun(event: TraceEvent, t: number) {
    const skill = event.skill ?? '';
    const token = event.token ?? 0;
    const mock = this.scenario.mocks[skill];
    const finish = Object.assign((ok: boolean) => this.run.complete(token, ok), { token });
    const node = this.doNodes.get(token);
    const move = this.doMoves.get(token);

    if (node === undefined && skill === this.baseSkill && mock === undefined) {
      this.phases(token, skill, t + PHASE_MS);

      return;
    }

    if (move && this.motion && mock === undefined) {
      this.motion.startMove({ token, skill, move }, (ok) => {
        if (!this.cancelled.has(token)) finish(ok);
      });

      return;
    }

    this.settle(node === undefined ? [skill] : [skill, node], t, mockLatency(mock, this.skillLatency(skill)), finish);
  }

  private phases(token: number, skill: string, t: number) {
    this.clock.at(t, ORDER.reply, () => {
      const fault = this.fault([skill, this.plan.base.node], t);

      if (this.cancelled.has(token) || fault?.kind === 'hang') return;

      if (fault?.kind === 'fail') {
        this.run.complete(token, false);

        return;
      }

      this.run.phase(token);
      this.phases(token, skill, t + PHASE_MS);
    });
  }

  private onOpStart(op: PlanOp | undefined, event: TraceEvent, t: number) {
    const token = event.token ?? 0;

    if (op?.kind === 'do') this.doNodes.set(token, op.node);

    if (op?.kind === 'do' && op.move) this.doMoves.set(token, op.move);

    if (!op || op.kind === 'do' || op.kind === 'wait') return;

    if (op.kind === 'say') return this.say(op, token, t);

    if (op.kind === 'infer') return this.infer(op, token, t);

    if (op.kind === 'ask') this.ask(op, token, t);
  }

  private say(op: PlanOp, token: number, t: number) {
    const text = renderText(this.plan.texts[op.text ?? 0], (f) => this.values.get(f));
    const finish = Object.assign((ok: boolean) => this.run.complete(token, ok), { token });

    this.said.push(text);
    this.record({ t, kind: 'said', node: op.node, text, token });
    this.settle([op.node], t, sayMs(text), finish);
  }

  private infer(op: PlanOp, token: number, t: number) {
    if (this.vision?.handles(op.model ?? '')) return this.inferVision(op, token, t);

    const mock = this.scenario.mocks[op.node] ?? this.scenario.mocks[op.model ?? ''];
    const result = inferResult(this.plan, op, mock);
    const finish = Object.assign(
      (ok: boolean) => {
        const sym = result.name === null ? -1 : this.intern(result.name);

        if (!ok) return this.run.complete(token, false);

        this.run.complete(token, true, { num: result.num, sym });
        this.values.set(op.fact ?? 0, { num: result.num, name: result.name });
        this.record({ t: this.clock.now, kind: 'result', node: op.node, value: result.num, name: result.name });
      },
      { token },
    );

    this.settle([op.node, op.model ?? ''], t, mockLatency(mock, INFER_MS), finish);
  }

  private inferVision(op: PlanOp, token: number, t: number) {
    const reply = () => {
      if (!this.visionWaits.has(token)) return;

      const result = this.vision?.read(op, this.clock.now);

      if (!result || this.cancelled.has(token)) return;

      this.visionWaits.get(token)?.();
      this.visionWaits.delete(token);

      const finish = Object.assign(
        (ok: boolean) => {
          if (!ok) return this.run.complete(token, false);

          this.run.complete(token, true, { num: result.num, sym: -1 });
          this.values.set(op.fact ?? 0, result);
          this.record({ t: this.clock.now, kind: 'result', node: op.node, value: result.num });
        },
        { token },
      );

      this.settle([op.node, op.model ?? ''], this.clock.now, 0, finish);
    };

    if (!this.vision) return;

    const wake = (captureAt: number) => this.clock.at(Math.max(this.clock.now, captureAt), ORDER.reply, reply);

    this.visionWaits.set(token, this.vision.subscribe(wake));
    this.clock.at(t, ORDER.reply, reply);
  }

  private ask(op: PlanOp, token: number, t: number) {
    const mock = this.scenario.mocks[op.node];
    const index = askAnswer(this.plan, op, mock);
    const garbage = this.fault([op.node], t + mockLatency(mock, ASK_MS))?.kind === 'garbage';
    const answers = op.answers ?? [];
    const finish = Object.assign(
      (ok: boolean) => {
        const chosen = garbage ? answers.length + 3 : index;

        if (!ok && !garbage) return this.run.complete(token, false);

        this.run.answer(token, chosen);
        this.values.set(op.fact ?? 0, { num: chosen, name: this.plan.symbols[answers[chosen]] ?? null });
        this.record({ t: this.clock.now, kind: 'answered', node: op.node, name: this.plan.symbols[answers[chosen]] });
      },
      { token },
    );

    this.settle([op.node], t, mockLatency(mock, ASK_MS), finish);
  }
}
