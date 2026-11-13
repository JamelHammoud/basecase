import type { CompileContext } from './compileContext';
import { leaves, positiveLeaves } from './compileConditions';
import type { Condition, Resource, SayStep, Step, TransitionProof } from './schema';
import { forEachStep, isGuarded } from './schema';

const MIN_PROOF_SEEDS = 8;
const SLOT = /\{([^{}]+)\}/g;
const TRACKED: readonly Resource[] = ['body', 'head'];

export interface ResolvedSlot {
  slot: string;
  fact: string;
  field: 'name' | 'score' | 'value';
}

interface Flow {
  defined: Set<string>;
  guards: Set<string>;
  holders: Record<string, Set<string>>;
}

const copyFlow = (f: Flow): Flow => ({
  defined: new Set(f.defined),
  guards: new Set(f.guards),
  holders: Object.fromEntries(TRACKED.map((r) => [r, new Set(f.holders[r])])),
});

function mergeFlows(flows: Flow[], keep: 'union' | 'intersection'): Flow {
  const [first, ...rest] = flows;
  const merged = copyFlow(first);

  for (const f of rest) {
    merged.defined =
      keep === 'union'
        ? new Set([...merged.defined, ...f.defined])
        : new Set([...merged.defined].filter((d) => f.defined.has(d)));

    for (const r of TRACKED) f.holders[r].forEach((s) => merged.holders[r].add(s));
  }

  return merged;
}

export class FlowChecker {
  readonly edges = new Set<string>();
  readonly slots = new Map<SayStep, ResolvedSlot[]>();
  private ends: Flow[] = [];
  private readonly ctx: CompileContext;

  constructor(ctx: CompileContext) {
    this.ctx = ctx;
  }

  private stopVia(skill: string): string {
    return this.ctx.skills.get(skill)?.stopVia ?? skill;
  }

  private holdsOf(skill: string): Resource[] {
    return this.ctx.skills.get(skill)?.holds ?? [];
  }

  private hubs(resource: Resource): Set<string> {
    const hubs = new Set<string>();
    const consider = (skill: string) => {
      if (this.holdsOf(skill).includes(resource)) hubs.add(this.stopVia(skill));
    };

    consider(this.ctx.routine.base.skill);
    forEachStep(
      this.ctx.routine.reactions.flatMap((r) => r.steps),
      (s) => s.kind === 'do' && consider(s.skill),
    );

    return hubs;
  }

  private proof(from: string, to: string): TransitionProof | null {
    const proof = this.ctx.skills.get(from)?.transitions[to];
    const hash = this.ctx.options.modelHash;

    return proof && proof.seeds >= MIN_PROOF_SEEDS && (!hash || proof.modelHash === hash) ? proof : null;
  }

  proven(from: string, to: string): boolean {
    if (from === to || this.stopVia(from) === to) return true;

    const listed = this.ctx.options.provenTransitions;

    if (listed) return listed.includes(`${from}->${to}`);

    return this.proof(from, to)?.falls === 0;
  }

  private edge(from: string, to: string, node: string) {
    const key = `${from}->${to}`;

    if (from === to || this.edges.has(key)) return;

    this.edges.add(key);

    if (this.proven(from, to)) return;

    const proof = this.ctx.options.provenTransitions ? null : this.proof(from, to);
    const message = proof
      ? `${from} to ${to} fell in ${proof.falls} of ${proof.seeds} tries in simulation.`
      : `${from} to ${to} isn't proven in simulation. Prove it, or stop first.`;

    this.ctx.fail('unproven-transition', message, node, { from, to, falls: proof?.falls ?? null });
  }

  run() {
    const base = this.ctx.routine.base;
    const start = (stopFirst: boolean): Flow => ({
      defined: new Set(),
      guards: new Set(),
      holders: Object.fromEntries(TRACKED.map((r) => [r, stopFirst ? this.hubs(r) : new Set<string>()])),
    });

    for (const r of this.ctx.routine.reactions) {
      this.ends = [];
      this.ends.push(this.sequence(r.steps, start(r.body === 'stopFirst')));

      if (r.body !== 'stopFirst') continue;

      for (const end of this.ends) end.holders.body.forEach((s) => this.edge(s, base.skill, r.id));

      this.hubs('body').forEach((hub) => this.edge(hub, base.skill, r.id));
    }

    const basePath = start(false);

    basePath.holders.body = new Set([this.stopVia(base.skill)]);
    this.sequence(base.onTimeout, basePath);
    this.sequence(base.onFail, basePath);
  }

  private sequence(steps: Step[], flow: Flow): Flow {
    return steps.reduce((f, s) => this.step(s, f), copyFlow(flow));
  }

  private requireDefined(cond: Condition, flow: Flow, node: string) {
    for (const leaf of leaves(cond)) {
      const source = this.ctx.facts.get(leaf.fact)?.source;

      if (source && source !== 'watcher' && !flow.defined.has(leaf.fact)) {
        this.ctx.fail('use-before-set', `${node} reads ${leaf.fact} before it's checked.`, node);
      }
    }
  }

  private guardPaths(step: Step, flow: Flow) {
    if (!isGuarded(step)) return;

    const failed = copyFlow(flow);

    if (step.kind === 'do') {
      for (const r of step.holds.filter((x) => TRACKED.includes(x)))
        failed.holders[r] = new Set([this.stopVia(step.skill)]);
    }

    this.ends.push(this.sequence(step.onTimeout, failed), this.sequence(step.onFail, failed));
  }

  private step(step: Step, flow: Flow): Flow {
    const node = this.ctx.nodeOf(step);

    this.guardPaths(step, flow);

    switch (step.kind) {
      case 'do':
        return this.doStep(step.skill, step.holds, flow, node);
      case 'infer':
      case 'ask':
        return { ...flow, defined: new Set([...flow.defined, node]) };
      case 'say':
        this.resolveSlots(step, flow, node);

        return flow;
      case 'wait':
        if (step.until) this.requireDefined(step.until, flow, node);

        return flow;
      case 'if':
        return this.ifStep(step, flow, node);
      default:
        return mergeFlows(
          step.branches.map((b) => this.sequence(b, flow)),
          step.join === 'all' ? 'union' : 'intersection',
        );
    }
  }

  private doStep(skill: string, holds: Resource[], flow: Flow, node: string): Flow {
    const next = copyFlow(flow);

    for (const r of holds.filter((x) => TRACKED.includes(x))) {
      flow.holders[r].forEach((prev) => this.edge(prev, skill, node));
      next.holders[r] = new Set([skill]);
    }

    return next;
  }

  private ifStep(step: Extract<Step, { kind: 'if' }>, flow: Flow, node: string): Flow {
    this.requireDefined(step.test, flow, node);

    const guarded = copyFlow(flow);

    positiveLeaves(step.test).forEach((leaf) => guarded.guards.add(leaf.fact));

    const then = this.sequence(step.then, guarded);
    const otherwise = this.sequence(step.else, flow);
    const merged = mergeFlows([then, otherwise], 'intersection');

    merged.guards = new Set(flow.guards);

    return merged;
  }

  private resolveSlot(raw: string, flow: Flow, node: string): ResolvedSlot | null {
    const [factPart, fieldPart] = raw.trim().split('.');
    const identities = [...flow.defined].filter((f) => this.ctx.facts.get(f)?.type === 'identity');
    const fact = factPart === 'name' && identities.length === 1 ? identities[0] : factPart;
    const field = factPart === 'name' ? 'name' : (fieldPart ?? 'value');
    const info = this.ctx.facts.get(fact);

    if (!info || !['name', 'score', 'value'].includes(field)) {
      this.ctx.fail('unknown-slot', `${node} can't fill {${raw}}.`, node);

      return null;
    }

    if (info.source !== 'watcher' && !flow.defined.has(fact)) {
      this.ctx.fail('use-before-set', `${node} says ${fact} before it's checked.`, node);
    }

    if (field === 'name' && !flow.guards.has(fact)) {
      this.ctx.fail('unguarded-name', `${node} could say a name without a match. Put it under an If on ${fact}.`, node);
    }

    return { slot: raw, fact, field: field as ResolvedSlot['field'] };
  }

  private resolveSlots(step: SayStep, flow: Flow, node: string) {
    const resolved = [...step.text.matchAll(SLOT)].map((m) => this.resolveSlot(m[1], flow, node));

    this.slots.set(
      step,
      resolved.filter((s): s is ResolvedSlot => s !== null),
    );
  }
}
