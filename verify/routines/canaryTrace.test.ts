import { describe, expect, it } from 'vitest';
import { compileRoutine, greetingRoutine, runScenario } from '../../src/routines/testing';
import { need } from '../lib/need';
import { ACCEPTANCE } from './acceptance';
import { FLOW_MODULE, type FlowModule } from './interfaces';

describe('canary: a trace event for a node that is not in the graph', () => {
  it('claims the event lit the flow, and must not', async () => {
    const mod = await need<FlowModule>(FLOW_MODULE, ['routineToFlow', 'lightFlow']).catch(() => null);
    const compiled = compileRoutine(greetingRoutine());

    if (!mod || !compiled.ok) return;

    const { routineToFlow, lightFlow } = mod;
    const flow = routineToFlow(greetingRoutine());
    const trace = (await runScenario(compiled.plan, ACCEPTANCE[0].scenario)).trace;
    const lit = lightFlow(flow, trace);

    if (lit.states.recognize !== 'done' || lit.rejected.length) return;

    const ghost = { t: 7000, kind: 'opStart', node: 'ghost', token: 999 };
    const withGhost = (() => {
      try {
        return lightFlow(flow, [...trace, ghost]);
      } catch {
        return null;
      }
    })();

    if (!withGhost) return;

    expect(withGhost.rejected).toEqual([]);
  });
});
