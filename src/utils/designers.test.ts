import { describe, expect, it } from 'vitest';
import type { AcpChatMessage, AcpToolCallEvent } from '../types/agentChat';
import { designerPartIds, designerSlots } from './designers';

const call = (
  id: string,
  toolName: string,
  rawInput: unknown = {},
  status: AcpToolCallEvent['status'] = 'completed',
) => ({
  toolCallId: id,
  title: toolName,
  toolName,
  status,
  rawInput,
});

const reply = (id: string, toolCalls: AcpToolCallEvent[]): AcpChatMessage => ({
  id,
  role: 'agent',
  text: '',
  timestamp: '',
  toolCalls,
});

describe('part designers', () => {
  it('numbers designers across the whole chat, so each batch gets distinct colours', () => {
    const slots = designerSlots([
      reply('a', [call('a1', 'Agent'), call('look', 'mcp__robotics_cad__look'), call('a2', 'Agent')]),
      reply('b', [call('b1', 'Task')]),
    ]);

    expect([...slots]).toEqual([
      ['a1', 0],
      ['a2', 1],
      ['b1', 2],
    ]);
  });

  it('lists the parts a designer wrote, skipping failed calls and reads', () => {
    const designer = {
      ...call('d', 'Agent'),
      children: [
        call('1', 'mcp__robotics_cad__add_parts', { parts: [{ id: 'thigh' }, { id: 'shin' }] }),
        call('2', 'mcp__robotics_cad__model_part', { id: 'thigh' }),
        call('3', 'mcp__robotics_cad__model_part', { id: 'foot' }, 'failed'),
        call('4', 'mcp__robotics_cad__update_parts', { updates: [{ id: 'knee' }] }),
        call('5', 'mcp__robotics_cad__mirror_parts', { ids: ['shin'], rename: { shin: 'shin_r' } }),
        call('6', 'mcp__robotics_cad__get_part_code', { id: 'hip' }),
      ],
    };

    expect(designerPartIds(designer)).toEqual(['thigh', 'shin', 'knee', 'shin_r']);
  });
});
