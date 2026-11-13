import { describe, expect, it } from 'vitest';
import { worstLine } from '../lib/stats.mjs';
import { leadPrompt } from './lead.mjs';

const world = {
  direction: { body: 'Make the loop better every week.' },
  comments: [],
  requests: [],
  tracked: [],
  arcs: [{ number: 224, title: 'Basecase improves its own harness every week', body: 'Measured.' }],
  ideas: [],
  steps: [],
};
const facts = { merged: 'Add a digest', copyLine: 'Copy this week: net +0 strings across 1 merged pull request' };
const worst = {
  lane: 'build',
  measure: 'revisions',
  name: 'Review rounds before pass, per pull request',
  last: 0.5,
  value: 1.25,
  score: 0.75,
};

describe('leadPrompt', () => {
  it("hands the lead the digest's worst number", () => {
    const prompt = leadPrompt(world, { ...facts, worst });

    expect(prompt).toContain("## The digest's worst number");
    expect(prompt).toContain(worstLine(worst));
    expect(prompt).toContain('`build` review rounds before pass, per pull request, 0.5 last week and 1.25 this week.');
  });

  it('leaves the section out when no digest named one', () => {
    const prompt = leadPrompt(world, { ...facts, worst: null });

    expect(prompt).not.toContain('worst number');
    expect(prompt).toContain('## Recently merged\n\nAdd a digest');
  });
});
