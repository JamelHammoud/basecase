import { describe, expect, it } from 'vitest';
import { compileRoutine, greetingRoutine } from '../../src/routines/testing';
import { need } from '../lib/need';
import { FLOW_MODULE, type FlowModule } from './interfaces';

describe('canary: a flow edit that drops a timeout path', () => {
  it('claims the edited flow still compiles, and must not', async () => {
    const mod = await need<FlowModule>(FLOW_MODULE, ['routineToFlow', 'flowToRoutine']).catch(() => null);

    if (!mod) return;

    const { routineToFlow, flowToRoutine } = mod;
    const flow = routineToFlow(greetingRoutine());

    if (!compileRoutine(flowToRoutine(structuredClone(flow))).ok) return;

    const dropped = flow.edges.filter((e) => e.from === 'recognize' && e.kind === 'timeout');

    if (dropped.length !== 1) return;

    flow.edges = flow.edges.filter((e) => !dropped.includes(e));

    const edited = (() => {
      try {
        return compileRoutine(flowToRoutine(flow));
      } catch {
        return null;
      }
    })();

    if (!edited) return;

    expect(edited.ok).toBe(true);
  });
});
