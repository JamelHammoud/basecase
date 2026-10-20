import { describe, expect, it } from 'vitest';
import { AcpToolCallEvent } from '../../types/robotics';
import { Segment } from './messageText';
import { groupLabel } from './toolLabel';
import { groupToolRuns } from './toolGroups';

const feed = (steps: (string | [string, AcpToolCallEvent['status']])[]) => {
  const calls = new Map<string, AcpToolCallEvent>();
  const segments: Segment[] = steps.map((step, i) => {
    if (typeof step === 'string' && step.startsWith('text:')) return { type: 'text', text: step.slice(5) };

    const [tool, status] = typeof step === 'string' ? [step, 'completed' as const] : step;
    const toolCallId = `t${i}`;

    calls.set(toolCallId, { toolCallId, title: '', toolName: `mcp__robotics_cad__${tool}`, status, rawInput: {} });

    return { type: 'tool', toolCallId };
  });

  return groupToolRuns(segments, calls).map((item) => (item.kind === 'group' ? groupLabel(item.calls) : item.index));
};

describe('groupToolRuns', () => {
  it('folds three or more consecutive calls of one tool, ignoring hidden ones between', () => {
    expect(feed(['model_part', 'model_part', 'set_status', 'model_part', 'look', 'look', 'text:Done'])).toEqual([
      'Designed 3 parts',
      4,
      5,
      6,
    ]);
  });

  it('breaks runs at text and other tools, and names a running group in the present', () => {
    expect(
      feed(['look', 'look', 'text:Hm', 'look', 'look', ['look', 'in_progress'], 'get_part_code', 'mystery_tool']),
    ).toEqual([0, 1, 2, 'Inspecting the model 3 times', 6, 7]);
  });

  it('never groups subagents', () => {
    expect(feed(['Agent', 'Agent', 'Agent']).filter((item) => typeof item === 'string')).toEqual([]);
  });
});
