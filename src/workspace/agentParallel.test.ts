import { describe, expect, it, vi } from 'vitest';
import type { AcpChatMessage, ScenePart } from '../types/robotics';
import { applySessionUpdate } from './acpTranscript';
import { ActorIndex, conflictText } from './agentActors';
import { laneKey, laneToDrop, MAIN_LANE, newLane, runningChats, splitLaneKey } from './agentLanes';
import { applyAgentOps, type AgentOpsContext } from './applyAgentOps';
import { recordEdit, revertEdits } from './runEdits';

const NOW = new Date('2026-01-02T03:04:05.000Z');

const fromSubagent = (parent: string, update: Record<string, unknown>) => ({
  ...update,
  _meta: { claudeCode: { parentToolUseId: parent } },
});

const agentCall = (id: string, description: string, status = 'in_progress') => ({
  sessionUpdate: 'tool_call',
  toolCallId: id,
  title: 'Agent',
  status,
  rawInput: { description, subagent_type: 'part-designer' },
  _meta: { claudeCode: { toolName: 'Agent' } },
});

function fakeScene(initial: ScenePart[]) {
  let parts = initial;
  const ctx = (index: ActorIndex, actor: string, busy: (lane: string) => boolean): AgentOpsContext => ({
    current: () => parts,
    commitParts: (fn) => {
      parts = fn(parts);
    },
    viewport: () => null,
    setCursor: () => {},
    setAction: () => {},
    isFollowing: () => false,
    guard: (id) => {
      const holder = index.holderOf(id, actor, busy);

      if (holder) return conflictText(id, holder, index);

      index.claim(id, actor);

      return null;
    },
    touch: () => {},
  });

  return { parts: () => parts, ctx };
}

describe('parallel agents', () => {
  it('keys lanes per tab and picks an idle lane to drop when full', () => {
    expect(laneKey('tab-1', MAIN_LANE)).toBe('tab-1');
    expect(splitLaneKey(laneKey('tab-1', 'lane-b'))).toEqual({ workspaceId: 'tab-1', laneId: 'lane-b' });
    expect(splitLaneKey('main')).toEqual({ workspaceId: 'main', laneId: MAIN_LANE });

    const lanes = ['a', 'b', 'c', 'd'].map((id, i) => ({ ...newLane(id), usedAt: i, busy: id === 'a' }));

    expect(laneToDrop(lanes, 'b')?.id).toBe('c');
    expect(laneToDrop(lanes.slice(0, 3), 'b')).toBeNull();
    expect(runningChats([{ ...lanes[0], chatId: 'chat-a' }], NOW).map((c) => c.id)).toEqual(['chat-a']);
  });

  it('nests a subagent’s steps and report under its Agent call', () => {
    let messages: AcpChatMessage[] = [{ id: 'u', role: 'user', text: 'Build it', timestamp: NOW.toISOString() }];

    messages = applySessionUpdate(messages, agentCall('agent-1', 'Left leg'), NOW);
    messages = applySessionUpdate(
      messages,
      fromSubagent('agent-1', { sessionUpdate: 'tool_call', toolCallId: 't1', title: 'model_part' }),
      NOW,
    );
    messages = applySessionUpdate(
      messages,
      fromSubagent('agent-1', { sessionUpdate: 'tool_call_update', toolCallId: 't1', status: 'completed' }),
      NOW,
    );
    messages = applySessionUpdate(
      messages,
      fromSubagent('agent-1', { sessionUpdate: 'agent_message_chunk', content: { text: 'Made 1 part.' } }),
      NOW,
    );

    const [call] = messages[1].toolCalls ?? [];

    expect(messages[1].toolCalls).toHaveLength(1);
    expect(messages[1].segments).toEqual([{ type: 'tool', toolCallId: 'agent-1' }]);
    expect(call.children?.map((c) => [c.toolCallId, c.status])).toEqual([['t1', 'completed']]);
    expect(call.childText).toBe('Made 1 part.');
    expect(messages[1].text).toBe('');
  });

  it('keeps sibling subagents and other chats off parts another agent is editing', async () => {
    vi.useFakeTimers();

    const index = new ActorIndex();
    const busy = new Set(['main', 'lane-b']);
    const isBusy = (lane: string) => busy.has(lane);

    index.note('main', agentCall('leg', 'Left leg'));
    index.note('main', agentCall('arm', 'Left arm'));
    index.note('main', fromSubagent('leg', { sessionUpdate: 'tool_call', toolCallId: 'leg-call' }));
    index.note('main', fromSubagent('arm', { sessionUpdate: 'tool_call', toolCallId: 'arm-call' }));

    const legActor = index.actorOf('main', 'leg-call');
    const armActor = index.actorOf('main', 'arm-call');
    const scene = fakeScene([]);
    const run = (actor: string, id: string) => {
      const done = applyAgentOps([{ op: 'add', part: { id, size: [10, 10, 10] } }], scene.ctx(index, actor, isBusy));

      void vi.runAllTimersAsync();

      return done;
    };

    expect(legActor).toBe('main/leg');
    expect(index.actorOf('main', 'unknown')).toBe('main');
    expect(await run('main', 'knee')).toContain('added knee');
    expect(await run(legActor, 'knee')).toContain('added knee');
    expect(await run(armActor, 'knee')).toContain('the “Left leg” part designer is working on it');
    expect(await run('lane-b', 'knee')).toContain('the “Left leg” part designer is working on it');

    index.note('main', { sessionUpdate: 'tool_call_update', toolCallId: 'leg', status: 'completed' });

    expect(await run(armActor, 'knee')).toContain('added knee');

    busy.delete('main');
    index.endLane('main');

    expect(await run('lane-b', 'knee')).toContain('added knee');
    expect(scene.parts().map((p) => p.id)).toEqual(['knee']);

    vi.useRealTimers();
  });

  it('reverts only the parts a run touched', () => {
    const part = (id: string, x: number) => ({ id, name: id, position: [x, 0, 0] }) as unknown as ScenePart;
    const before = [part('kept', 0), part('moved', 0), part('deleted', 0)];
    let edits = recordEdit({}, 'moved', before[1]);

    edits = recordEdit(edits, 'moved', part('moved', 99));
    edits = recordEdit(edits, 'deleted', before[2]);
    edits = recordEdit(edits, 'added', null);

    const after = [part('kept', 5), part('moved', 40), part('added', 0), part('user', 1)];
    const reverted = revertEdits(after, edits);

    expect(reverted.map((p) => [p.id, p.position[0]])).toEqual([
      ['kept', 5],
      ['moved', 0],
      ['user', 1],
      ['deleted', 0],
    ]);
  });
});
