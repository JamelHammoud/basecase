import { describe, expect, it } from 'vitest';
import { PART_DESIGNER_INSTRUCTIONS, cadAgentInstructions } from '../cad-agent-prompt.mjs';
import { GUIDES } from '../cad-agent-guides/index.mjs';
import { createGuidePusher, guidesFor } from './guideTools.mjs';

const ok = { content: [{ type: 'text', text: 'Added 2 parts.' }] };
const guideNames = (result) =>
  result.content
    .slice(1)
    .flatMap((c) => c.text.split('\n'))
    .filter((l) => l.startsWith('## Guide: '))
    .map((l) => l.slice('## Guide: '.length));

describe('guide push', () => {
  it('attaches each guide once, the first time it applies', () => {
    const push = createGuidePusher();
    const args = { parts: [{ id: 'head_shell' }, { id: 'neck', catalog: 'component:feetech-sts3215|c018' }] };

    expect(guideNames(push('add_parts', args, ok))).toEqual(['priors', 'shells', 'servos']);
    expect(push('add_parts', args, ok)).toBe(ok);
    expect(guideNames(push('model_part', { id: 'x', language: 'replicad' }, ok))).toEqual(['replicad']);
  });

  it('leaves errors alone', () => {
    const push = createGuidePusher();
    const error = { isError: true, content: [{ type: 'text', text: 'failed' }] };

    expect(push('simulate', {}, error)).toBe(error);
    expect(guideNames(push('simulate', {}, ok))).toEqual(['simulation']);
  });

  it('only names guides that exist', () => {
    const tools = ['look', 'fasten', 'get_bom', 'define_joints', 'simulate', 'find_objects', 'get_rig'];

    for (const name of tools.flatMap((t) => guidesFor(t, {}))) expect(GUIDES[name]).toBeDefined();
  });
});

describe('instructions', () => {
  it('never tell the agent to make the checks pass', () => {
    for (const prompt of [cadAgentInstructions({ subagents: true }), PART_DESIGNER_INSTRUCTIONS]) {
      expect(prompt).not.toMatch(/make every check pass/i);
      expect(prompt).not.toMatch(/0\.2–0\.5 mm proud/);
      expect(prompt).toMatch(/Never narrow a joint range/);
    }
  });

  it('keep Claude-only sections out of other agents', () => {
    expect(cadAgentInstructions({ subagents: true })).toMatch(/Parallel part designers/);
    expect(cadAgentInstructions({ subagents: false })).not.toMatch(/Parallel part designers/);
  });
});
