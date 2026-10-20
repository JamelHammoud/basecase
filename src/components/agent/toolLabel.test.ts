import { describe, expect, it } from 'vitest';
import { AcpToolCallEvent } from '../../types/robotics';
import { toolLabel } from './toolLabel';

const call = (toolName: string, rawInput: unknown, status: AcpToolCallEvent['status'] = 'completed') =>
  ({ toolCallId: 't1', title: '', toolName, rawInput, status }) as AcpToolCallEvent;

describe('toolLabel', () => {
  it('hides status and todo tools', () => {
    expect(toolLabel(call('mcp__cad__set_status', {}))).toBeNull();
    expect(toolLabel(call('TodoWrite', {}))).toBeNull();
  });

  it('names part work in progress and done', () => {
    expect(toolLabel(call('model_part', { name: 'Left Coxa Bracket', language: 'replicad' }, 'in_progress'))).toEqual({
      title: 'Designing Left Coxa Bracket',
    });
    expect(toolLabel(call('model_part', {}))).toEqual({ title: 'Designed part' });
  });

  it('summarizes part lists and groups', () => {
    expect(toolLabel(call('add_parts', { parts: [{ group: 'Leg' }, { group: 'Leg' }, { group: 'Arm' }] }))).toEqual({
      title: 'Blocked out 3 parts',
      detail: 'Leg, Arm',
    });
    expect(toolLabel(call('add_parts', {}))).toEqual({ title: 'Blocked out parts', detail: undefined });
    expect(toolLabel(call('delete_parts', { ids: ['a', 'b', 'c', 'd', 'e'] }))).toEqual({
      title: 'Removed 5 parts',
      detail: 'a, b, c, d, e',
    });
    expect(toolLabel(call('update_parts', { updates: [{ id: 'x', name: 'Head' }] }))).toEqual({
      title: 'Adjusted 1 part',
      detail: 'Head',
    });
  });

  it('prefers compare over look and websearch over fetch', () => {
    expect(toolLabel(call('compare', { reference: 'ref-2', views: ['front'] }))).toEqual({
      title: 'Compared with ref-2',
    });
    expect(toolLabel(call('look', { ids: [] }, 'pending'))).toEqual({
      title: 'Looking at the model',
      detail: undefined,
    });
    expect(toolLabel(call('WebSearch', { query: 'sts3215' }))).toEqual({ title: 'Searched', detail: 'sts3215' });
    expect(toolLabel(call('WebFetch', { url: 'https://example.com/a' }))).toEqual({
      title: 'Read',
      detail: 'example.com',
    });
    expect(toolLabel(call('find_images', { url: 'not a url' }))).toEqual({ title: 'Found photos', detail: undefined });
  });

  it('counts files and photos', () => {
    expect(toolLabel(call('read_evidence', { paths: ['a/b/notes.txt', 'c/d.png'] }))).toEqual({
      title: 'Studied 2 attached files',
      detail: 'notes.txt, d.png',
    });
    expect(toolLabel(call('view_image', { urls: ['u'] }))).toEqual({ title: 'Looked at a photo' });
    expect(toolLabel(call('robot_skeleton', { url: 'https://x/y/robot.urdf' }))).toEqual({
      title: 'Read the joint layout',
      detail: 'robot.urdf',
    });
  });

  it('names Basecase tools in plain words', () => {
    expect(
      toolLabel(call('mcp__robotics_cad__define_joints', { joints: [{ id: 'knee', name: 'Left Knee' }] })),
    ).toEqual({
      title: 'Defined 1 joint',
      detail: 'Left Knee',
    });
    expect(toolLabel(call('mcp__robotics_cad__simulate', { controller: 'hold' }, 'in_progress'))).toEqual({
      title: 'Simulating 5 s',
      detail: 'Holding the pose',
    });
    expect(toolLabel(call('mcp__robotics_cad__brand_new_tool', {}))).toEqual({ title: 'Brand new tool' });
  });

  it('falls back to the title', () => {
    expect(toolLabel({ toolCallId: 't', title: 'Something else', status: 'completed' } as AcpToolCallEvent)).toEqual({
      title: 'Something else',
    });
  });
});
