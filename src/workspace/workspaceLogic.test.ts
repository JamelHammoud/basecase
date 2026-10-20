import { describe, expect, it } from 'vitest';
import { DEFAULT_PROJECT, type AcpChatMessage, type ScenePart } from '../types/robotics';
import { applySessionUpdate, chatTitle, markLastAgentStopped } from './acpTranscript';
import { applyBuildSettings } from './agentBuildRequests';
import { pushHistory, stepHistory, docFromParts } from './docHistory';
import { copyName, fileSafe, listNames } from './helpers';
import { copyToClipboard, takePaste } from './partsClipboard';
import { dropToFloor, stackedPosition } from './partTransforms';
import { clickSelection } from './selection';
import type { Snapshot } from './types';

const part = (id: string, position: [number, number, number], extra: Partial<ScenePart> = {}): ScenePart => ({
  id,
  name: id,
  kind: 'box',
  category: 'structure',
  role: 'solid',
  position,
  rotation: [0, 0, 0],
  dimensions: { width: 20, height: 10, depth: 20 },
  color: '#888888',
  note: '',
  visible: true,
  locked: false,
  ...extra,
});

const NOW = new Date('2026-01-02T03:04:05.000Z');

describe('scene history', () => {
  it('undoes and redoes through snapshots, folding live edits into one step', () => {
    const a = [part('a', [0, 5, 0])];
    const b = [part('a', [10, 5, 0])];
    const snap = { pose: undefined, joints: undefined, marks: undefined };
    const live = { ...docFromParts(a), base: a, parts: [part('a', [5, 5, 0])] };
    const committed = pushHistory(live, b, snap);

    expect(committed.past).toHaveLength(1);
    expect(committed.past[0].parts).toBe(a);

    const here: Snapshot = { parts: committed.parts, ...snap };
    const undone = stepHistory(committed, here, 'undo');

    expect(undone?.doc.parts).toBe(a);
    expect(undone?.doc.future).toEqual([here]);
    expect(stepHistory(undone!.doc, { parts: a, ...snap }, 'redo')?.doc.parts).toBe(b);
    expect(stepHistory(docFromParts(a), here, 'undo')).toBeNull();
  });
});

describe('agent transcript', () => {
  it('streams thoughts, text and tool calls into the running agent message', () => {
    let messages: AcpChatMessage[] = [{ id: 'u', role: 'user', text: 'Build a lamp', timestamp: NOW.toISOString() }];

    messages = applySessionUpdate(messages, { sessionUpdate: 'agent_thought_chunk', content: { text: 'Hmm' } }, NOW);
    messages = applySessionUpdate(messages, { sessionUpdate: 'agent_message_chunk', content: { text: 'Done' } }, NOW);
    messages = applySessionUpdate(messages, { sessionUpdate: 'tool_call', toolCallId: 't1', title: 'Look' }, NOW);
    messages = applySessionUpdate(
      messages,
      { sessionUpdate: 'tool_call_update', toolCallId: 't1', status: 'completed' },
      NOW,
    );

    const agent = messages[1];

    expect(agent.id).toBe(`msg-agent-${NOW.getTime()}`);
    expect(agent.thought).toBe('Hmm');
    expect(agent.text).toBe('Done');
    expect(agent.toolCalls).toEqual([
      { toolCallId: 't1', title: 'Look', status: 'completed', kind: '', rawInput: undefined, toolName: undefined },
    ]);
    expect(agent.segments).toEqual([
      { type: 'thought', text: 'Hmm' },
      { type: 'text', text: 'Done' },
      { type: 'tool', toolCallId: 't1' },
    ]);
    expect(markLastAgentStopped(messages)[1].stopped).toBe(true);
    expect(chatTitle(messages)).toBe('Build a lamp');
  });
});

describe('workspace helpers', () => {
  it('names copies, lists and file names the way the UI shows them', () => {
    expect(copyName('Sprout', ['Sprout copy'])).toBe('Sprout copy 2');
    expect(copyName('Sprout copy 2', [])).toBe('Sprout copy');
    expect(listNames(['G1', 'Go2', 'Spot'])).toBe('G1, Go2 and Spot');
    expect(fileSafe('Robot Arm #2')).toBe('robot-arm-2');
    expect(fileSafe('!!!')).toBe('robotics-mechanism');
  });

  it('selects whole groups, then drills in on the next click', () => {
    const unit = ['a', 'b'];

    expect(clickSelection([], 'a', unit, { additive: false, drill: false })).toEqual(unit);
    expect(clickSelection(['a'], 'b', unit, { additive: false, drill: false })).toEqual(['b']);
    expect(clickSelection(['c'], 'a', unit, { additive: true, drill: false })).toEqual(['c', 'a', 'b']);
    expect(clickSelection(['a', 'b'], 'a', unit, { additive: true, drill: false })).toEqual([]);
  });

  it('stacks on the highest solid below and drops loose parts to the floor', () => {
    const base = part('base', [0, 5, 0]);
    const top = part('top', [5, 40, 5]);

    expect(stackedPosition(top, [base, top])).toEqual([5, 15, 5]);
    expect(dropToFloor([base, top], new Set(['top']))[1].position).toEqual([5, 5, 5]);
  });

  it('pastes copies with fresh ids, stepping 15 mm per paste in the same scene', () => {
    copyToClipboard([part('a', [0, 5, 0], { jointId: 'j1', group: { id: 'g', name: 'Arm' } })], 'tab', false);

    const first = takePaste('tab')!;
    const second = takePaste('tab')!;

    expect(first[0].position).toEqual([15, 5, 15]);
    expect(second[0].position).toEqual([30, 5, 30]);
    expect(first[0].id).not.toBe('a');
    expect(first[0].group?.name).toBe('Arm');
    expect(first[0].group?.id).not.toBe('g');
    expect('jointId' in first[0]).toBe(false);
    expect(takePaste('other')![0].position).toEqual([0, 5, 0]);
  });

  it('merges build extras and rejects unknown keys', () => {
    const project = { ...DEFAULT_PROJECT, extras: [{ key: 'supply:lipo-2s-2200', qty: 1 }] };
    const { next, bad } = applyBuildSettings(project, {
      extras: [
        { key: 'supply:lipo-2s-2200', qty: 0 },
        { key: 'supply:lipo-3s-2200', qty: 2.4 },
        { key: 'nonsense', qty: 1 },
      ],
      budgetUsd: 0,
    });

    expect(bad).toEqual(['nonsense']);
    expect(next.extras).toEqual([{ key: 'supply:lipo-3s-2200', qty: 2, note: undefined }]);
    expect(next.budgetUsd).toBeUndefined();
  });
});
