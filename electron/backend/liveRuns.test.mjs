import { describe, expect, it } from 'vitest';
import { AgentBridge } from './agentBridge.mjs';
import { EventHub } from './eventHub.mjs';
import { LiveRuns } from './liveRuns.mjs';

describe('LiveRuns', () => {
  it('journals a run so a reloaded window can rebuild it', () => {
    const runs = new LiveRuns();
    const messages = [{ id: 'u1' }, { id: 'a1' }];

    runs.start('tab-1__lane-a', { sessionId: 's1', run: { chatId: 'c1', messages } });
    runs.note('tab-1__lane-a', { sessionUpdate: 'agent_message_chunk' });
    runs.steer('tab-1__lane-a', [{ id: 'u2' }, { id: 'a2' }]);
    runs.note('other', { sessionUpdate: 'agent_message_chunk' });
    runs.finish('tab-1__lane-a', { stopReason: 'end_turn' });
    runs.note('tab-1__lane-a', { sessionUpdate: 'late' });

    const [run] = runs.ofWorkspace('tab-1');

    expect(run).toMatchObject({ key: 'tab-1__lane-a', sessionId: 's1', chatId: 'c1', busy: false });
    expect(run.entries.map((e) => (e.update ? e.update.sessionUpdate : e.messages.map((m) => m.id).join()))).toEqual([
      'u1,a1',
      'agent_message_chunk',
      'u2,a2',
    ]);
    expect(runs.ofWorkspace('tab-10')).toEqual([]);

    runs.forget('tab-1__lane-a');

    expect(runs.ofWorkspace('tab-1')).toEqual([]);
  });
});

describe('AgentBridge.replay', () => {
  it('sends unanswered requests again to the tab that reloaded', () => {
    const events = new EventHub();
    const bridge = new AgentBridge({ events, onError: () => {} });
    const seen = [];

    events.on((event) => seen.push(event));
    bridge.requestRenderer('snapshot', {}, 1000, 'tab-1__lane-a').catch(() => {});
    bridge.requestRenderer('snapshot', {}, 1000, 'tab-2').catch(() => {});
    bridge.replay('tab-1');

    expect(seen.map((e) => e.workspaceId)).toEqual(['tab-1__lane-a', 'tab-2', 'tab-1__lane-a']);
    expect(seen[2].requestId).toBe(seen[0].requestId);

    for (const { requestId } of seen) bridge.resolveRequest({ requestId, result: {} });
  });
});
