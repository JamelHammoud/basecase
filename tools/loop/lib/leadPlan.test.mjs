import { describe, expect, it, vi } from 'vitest';
import { applyPlan, plannedLine } from './leadPlan.mjs';
import { openMatch } from './titles.mjs';

describe('telling a request what it became', () => {
  it('names every step in one line', () => {
    expect(plannedLine([482])).toBe('Planned as #482.');
    expect(plannedLine([482, 483])).toBe('Planned as #482 and #483.');
    expect(plannedLine([482, 483, 484, 485])).toBe('Planned as #482, #483, #484 and #485.');
  });
});

describe('planning around blocked work', () => {
  it('links a reworded request to its blocked step without creating another executable task', () => {
    const existing = {
      number: 42,
      title: 'Open the Case in a Live Console with its robot, cameras, tries and joints',
      labels: ['loop:blocked'],
      url: 'https://github.com/o/r/issues/42',
    };
    const gh = {
      findOpenIssue: ({ title, similarAmong }) => openMatch(title, [existing], similarAmong),
      createIssue: vi.fn(),
      editIssueLabels: vi.fn(),
      commentOnIssue: vi.fn(),
      setIssueBody: vi.fn(),
    };
    const world = { arcs: [], steps: [], requests: [{ number: 17 }], tracked: [], ideas: [] };
    const output = {
      newArcs: [],
      retireArcs: [],
      dropIdeas: [],
      doneRequests: [],
      steps: [
        {
          title: 'Open a Case as a Live Console with the robot, its cameras, joints and tries',
          body: 'Build it.',
          requires: ['repository'],
          request: 17,
        },
      ],
    };

    applyPlan(output, world, { gh, log: vi.fn() });

    expect(gh.createIssue).not.toHaveBeenCalled();
    expect(gh.commentOnIssue).toHaveBeenCalledWith(17, 'Planned as #42.');
  });
});
