import { describe, expect, it } from 'vitest';
import { flowToRoutine, lightFlow, routineToFlow } from './flow';
import { nodeLabel } from './flowLabels';
import { greetingRoutine } from './greeting';
import { canonicalJson } from './hash';

describe('flow', () => {
  it('draws the greeting and reads it back unchanged', () => {
    const flow = routineToFlow(greetingRoutine());

    expect(canonicalJson(flowToRoutine(structuredClone(flow)))).toBe(canonicalJson(greetingRoutine()));
    expect(flow.edges).toContainEqual({ from: 'person', to: 'greet', kind: 'trigger' });
    expect(flow.edges).toContainEqual({ from: 'recognize', to: 'helloAfterTimeout', kind: 'timeout' });
  });

  it('turns a flow it cannot read into something the compiler refuses', () => {
    const flow = routineToFlow(greetingRoutine());

    expect(flowToRoutine({ ...flow, nodes: flow.nodes.filter((n) => n.kind !== 'base') })).toBeNull();

    const loop = [...flow.edges, { from: 'turnAway', to: 'excuseMe', kind: 'next' as const }];

    expect(flowToRoutine({ ...flow, edges: loop })).toBeNull();
  });

  it('lights nodes from events and rejects events for nodes it lacks', () => {
    const flow = routineToFlow(greetingRoutine());
    const lit = lightFlow(flow, [
      { t: 0, kind: 'fired', reaction: 'greet' },
      { t: 1, kind: 'opStart', node: 'recognize', token: 2 },
      { t: 2, kind: 'opStart', node: 'nowhere', token: 3 },
    ]);

    expect(lit.states.greet).toBe('active');
    expect(lit.states.recognize).toBe('active');
    expect(lit.rejected).toHaveLength(1);
  });

  it('labels nodes in plain words', () => {
    const flow = routineToFlow(greetingRoutine());
    const label = (id: string) => nodeLabel(flow.nodes.find((n) => n.id === id)!);

    expect(label('recognize')).toEqual({ kind: 'Check', text: 'Check Face' });
    expect(label('helloName')).toEqual({ kind: 'Say', text: '“Hello {name}”' });
  });
});
