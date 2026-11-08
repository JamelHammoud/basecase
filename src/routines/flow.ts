import { CompileContext } from './compileContext';
import {
  endNodeId,
  type Flow,
  type FlowEdge,
  type FlowEdgeKind,
  type FlowNode,
  type FlowNodeKind,
  GUARD_EDGES,
  withoutChildren,
} from './flowTypes';
import type { Condition, Routine, Step } from './schema';
import { isGuarded } from './schema';

export { flowToRoutine } from './flowRead';
export { lightFlow, type Lighting } from './flowLight';
export type * from './flowTypes';

const ROUTINE_SKIP = new Set(['base', 'watchers', 'reactions']);

export function conditionFacts(condition: Condition): string[] {
  if ('fact' in condition) return [condition.fact];

  if ('all' in condition) return condition.all.flatMap(conditionFacts);

  if ('any' in condition) return condition.any.flatMap(conditionFacts);

  return conditionFacts(condition.not);
}

class FlowBuilder {
  readonly nodes: FlowNode[] = [];
  readonly edges: FlowEdge[] = [];
  private readonly names: Map<Step, string>;

  constructor(names: Map<Step, string>) {
    this.names = names;
  }

  node(id: string, kind: FlowNodeKind, data: Record<string, unknown>) {
    this.nodes.push({ id, kind, data });
  }

  edge(from: string, to: string, kind: FlowEdgeKind) {
    this.edges.push({ from, to, kind });
  }

  private end(from: string, kind: string): string {
    const id = endNodeId(from, kind);

    this.node(id, 'end', {});

    return id;
  }

  sequence(steps: Step[]): string | null {
    let first: string | null = null;
    let previous: string | null = null;

    for (const step of steps) {
      const id = this.step(step);

      if (previous === null) first = id;
      else this.edge(previous, id, 'next');

      previous = id;
    }

    return first;
  }

  guard(id: string, step: Extract<Step, { onTimeout: Step[] }>) {
    for (const [key, kind] of GUARD_EDGES) this.edge(id, this.sequence(step[key]) ?? this.end(id, kind), kind);
  }

  step(step: Step, kind: FlowNodeKind = step.kind): string {
    const id = this.names.get(step) ?? step.kind;

    this.node(id, kind, withoutChildren(step));

    if (isGuarded(step)) this.guard(id, step);
    else if (step.kind === 'if') this.branches(id, step);
    else this.together(id, step);

    return id;
  }

  private branches(id: string, step: Extract<Step, { kind: 'if' }>) {
    const then = this.sequence(step.then);
    const otherwise = this.sequence(step.else);

    if (then !== null) this.edge(id, then, 'then');

    if (otherwise !== null) this.edge(id, otherwise, 'else');
  }

  private together(id: string, step: Extract<Step, { kind: 'together' }>) {
    step.branches.forEach((branch, i) => this.edge(id, this.sequence(branch) ?? this.end(id, `branch${i}`), 'branch'));
  }
}

function triggers(builder: FlowBuilder, routine: Routine) {
  const ids = new Set(builder.nodes.filter((n) => n.kind !== 'end').map((n) => n.id));

  for (const reaction of routine.reactions) {
    const facts = new Set(conditionFacts(reaction.when).filter((f) => ids.has(f)));

    for (const fact of facts) builder.edge(fact, reaction.id, 'trigger');
  }
}

export function routineToFlow(routine: Routine): Flow {
  const names = new CompileContext(routine, { skills: [] }).names;
  const builder = new FlowBuilder(names);
  const own = Object.fromEntries(Object.entries(structuredClone(routine)).filter(([k]) => !ROUTINE_SKIP.has(k)));

  builder.step(routine.base, 'base');

  for (const watcher of routine.watchers) builder.node(watcher.id, 'watcher', structuredClone({ ...watcher }));

  for (const reaction of routine.reactions) {
    builder.node(reaction.id, 'reaction', withoutChildren(reaction));

    const first = builder.sequence(reaction.steps);

    if (first !== null) builder.edge(reaction.id, first, 'next');
  }

  triggers(builder, routine);

  return { routine: own, nodes: builder.nodes, edges: builder.edges };
}
