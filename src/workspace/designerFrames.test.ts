import { describe, expect, it } from 'vitest';
import { AGENT_COLOR, designerColor } from '../design-system';
import type { AcpChatMessage } from '../types/robotics';
import { colorCursors, designerFrames, openedFocus } from './designerFrames';

const messages: AcpChatMessage[] = [
  {
    id: 'r',
    role: 'agent',
    text: '',
    timestamp: '',
    toolCalls: [
      { toolCallId: 'leg', title: 'Agent', toolName: 'Agent', status: 'in_progress' },
      { toolCallId: 'arm', title: 'Agent', toolName: 'Agent', status: 'in_progress' },
    ],
  },
];

const cursor = (actor: string, parts: string[]) => ({ actor, name: actor, target: null, action: '', parts });

const cursors = colorCursors(
  [cursor('main', ['torso']), cursor('main/leg', ['thigh']), cursor('main/arm', [])],
  () => messages,
);

describe('designerFrames', () => {
  it('colours the lead coral and each designer by its place in the chat', () => {
    expect(cursors.map((c) => c.color)).toEqual([AGENT_COLOR, designerColor(0), designerColor(1)]);
  });

  it('frames only designers holding parts, and focuses the hovered one', () => {
    expect(designerFrames(cursors, null)).toEqual([
      { key: 'leg', color: designerColor(0), partIds: ['thigh'], emphasis: 'normal' },
    ]);

    const focused = designerFrames(cursors, { callId: 'arm', color: designerColor(1), partIds: ['hand'] });

    expect(focused.map((f) => [f.key, f.emphasis, f.partIds])).toEqual([
      ['leg', 'dim', ['thigh']],
      ['arm', 'focus', ['hand']],
    ]);
  });

  it('keeps an opened subagent framed, and lets go once its chat is gone', () => {
    expect(openedFocus(messages, 'arm')).toEqual({ callId: 'arm', color: designerColor(1), partIds: [] });
    expect(openedFocus([], 'arm')).toBeNull();
  });
});
