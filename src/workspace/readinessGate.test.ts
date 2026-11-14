import { describe, expect, it } from 'vitest';
import type { Finding, Readiness } from '../readiness/types';
import { readinessGate } from './readinessGate';
import type { WorkspaceCore } from './useWorkspaceCore';

const blocker = (key: string): Finding => ({
  key,
  level: 'blocker',
  area: 'fit',
  check: 'Fit',
  rule: 'clash',
  ruleName: 'Overlapping Parts',
  text: key,
  agentText: key,
  ids: [],
});
const verdict = (fingerprint: string, keys: string[], status: Readiness['status'] = 'blocked'): Readiness => ({
  status,
  blockers: keys.map(blocker),
  notes: [],
  checks: [],
  ignored: [],
  ignoredRules: [],
  findings: [],
  rows: [],
  fingerprint,
  checkedAt: '',
});

function gateOver(results: Readiness[], autoFixBlockers = true) {
  let i = 0;
  const core = {
    studio: { autoFixBlockers },
    docs: { partsRef: { current: [] } },
    readiness: { checkNow: async () => results[Math.min(i++, results.length - 1)], startTurn: () => undefined },
  } as unknown as WorkspaceCore;
  const gate = readinessGate(core);

  gate.begin();

  return gate;
}

describe('the follow-up after a turn', () => {
  it('asks the agent to fix blockers its turn added', async () => {
    const request = await gateOver([verdict('a', ['old']), verdict('b', ['old', 'new'])]).followUp();

    expect(request?.text).toBe('Your last change added 1 problem. Fix it.');
    expect(request?.quotes.map((q) => q.id)).toEqual(['new']);
  });

  it('stays quiet when nothing new appeared', async () => {
    expect(await gateOver([verdict('a', ['old']), verdict('b', ['old'])]).followUp()).toBeNull();
  });

  it('stays quiet when the model did not change', async () => {
    expect(await gateOver([verdict('a', []), verdict('a', ['x'])]).followUp()).toBeNull();
  });

  it('leaves a block-out alone', async () => {
    expect(await gateOver([verdict('a', []), verdict('b', ['x'], 'blockout')]).followUp()).toBeNull();
  });

  it('stops after two rounds', async () => {
    const gate = gateOver([
      verdict('a', []),
      verdict('b', ['1']),
      verdict('c', ['1', '2']),
      verdict('d', ['1', '2', '3']),
    ]);

    expect(await gate.followUp()).not.toBeNull();
    expect(await gate.followUp()).not.toBeNull();
    expect(await gate.followUp()).toBeNull();
  });

  it('respects the setting', async () => {
    expect(await gateOver([verdict('a', []), verdict('b', ['x'])], false).followUp()).toBeNull();
  });
});
