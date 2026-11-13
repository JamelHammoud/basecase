import { describe, expect, it } from 'vitest';
import { missingLabel } from '../lib/github.mjs';
import { freshIdeas, ideaBody, labelsFor, STAGES } from './ideas.mjs';

const idea = (title, scale = 'feature') => ({
  title,
  scale,
  for: 'both',
  moment: 'You pick two grippers and see which one picks the cup more often.',
  bestToday: 'Zeromatter compares end-effectors before procurement.',
  basecaseToday: 'src/cases/ runs one design per Case.',
  firstStep: 'Run a Case against two saved variants and show both pass rates.',
});

describe('ideas lane', () => {
  it('covers the first robot and all six stages', () => {
    expect(STAGES.map((stage) => stage.name)).toEqual([
      'First robot',
      'Design',
      'Engineer',
      'Simulate',
      'Train',
      'Build',
      'Operate',
      'New directions',
    ]);
  });

  it('drops ideas whose title is already open or repeated, ignoring case and a final period', () => {
    const ideas = [
      idea('Compare two grippers in one Case'),
      idea('compare two grippers in one case.'),
      idea('Scan a room'),
    ];

    expect(freshIdeas(ideas, ['Scan a room']).map((i) => i.title)).toEqual(['Compare two grippers in one Case']);
  });

  it('writes the case for an idea into its body', () => {
    const body = ideaBody(idea('Compare two grippers in one Case'), 'Simulate');

    expect(body).toContain('**Stage:** Simulate');
    expect(body).toContain('**For:** Both the first robot and the thousandth');
    expect(body).toContain('**First step:** Run a Case');
  });

  it('labels a big bet so it can be found, and says its first steps', () => {
    const bet = idea('Ship a robot as a kit from one sentence', 'big bet');

    expect(labelsFor(bet)).toEqual(['loop:idea', 'loop:big-bet']);
    expect(labelsFor(idea('Compare two grippers'))).toEqual(['loop:idea']);
    expect(ideaBody(bet, 'New directions')).toContain('**Scale:** Big bet');
    expect(ideaBody(bet, 'New directions')).toContain('**Why now, and the first steps:**');
  });

  it('names a missing loop label from gh, and only loop labels', () => {
    expect(missingLabel("could not add label: 'loop:market' not found")).toBe('loop:market');
    expect(missingLabel("failed to update https://github.com/x/y/issues/1: 'loop:idea' not found")).toBe('loop:idea');
    expect(missingLabel("could not add label: 'bug' not found")).toBeNull();
    expect(missingLabel('HTTP 504: Gateway Timeout')).toBeNull();
  });
});
