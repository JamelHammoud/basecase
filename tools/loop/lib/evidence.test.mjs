import { describe, expect, it } from 'vitest';
import {
  evidenceCount,
  evidenceText,
  gatherEvidence,
  isOwnerNote,
  isRevert,
  kindOf,
  parseReview,
} from './evidence.mjs';
import { LOOP_MARK, withMark } from './mark.mjs';

const OWNER = 'JamelHammoud';
const SINCE = '2026-11-05T00:00:00Z';

const failing = [
  '### Review: changes needed (0291b86)',
  'The credit tooling is too broad.',
  '',
  '- **blocker** `tools/loop/credit.mjs:3`: Bans the word AI. Fix: match only credit lines.',
  '- **blocker** `tools/hooks/commit-msg.mjs`: Runs on merges. Fix: skip them.',
  '- **minor** `docs/guide/loop.md:12`: Wordy. Fix: cut it.',
].join('\n');

describe('parseReview', () => {
  it('reads a failing review with its findings', () => {
    expect(parseReview(failing)).toEqual({ verdict: 'fail', sha: '0291b86', blockers: 2, minors: 1 });
  });

  it('reads a passing review with no findings', () => {
    expect(parseReview('### Review: pass (2dcc452)\nThe fake child is right.')).toEqual({
      verdict: 'pass',
      sha: '2dcc452',
      blockers: 0,
      minors: 0,
    });
  });

  it('ignores a comment that only mentions a review', () => {
    expect(parseReview('Folded into #4. The review found a bug.')).toBeNull();
    expect(parseReview('Quoting:\n### Review: pass (2dcc452)')).toBeNull();
  });

  it('does not count findings named in prose', () => {
    expect(parseReview('### Review: pass (abc1234)\nNo **blocker** here.')?.blockers).toBe(0);
  });
});

describe('isOwnerNote', () => {
  const comment = (body, author = OWNER) => ({ author, body });

  it('keeps what Jamel wrote himself', () => {
    expect(isOwnerNote(comment('Stop adding captions under every chart.'), OWNER)).toBe(true);
  });

  it.each([
    ['a review the loop posted', comment(failing)],
    ['a marked loop comment', comment(withMark('Folded into #4.'))],
    ['someone else', comment('Nice.', 'someone')],
  ])('drops %s', (_, c) => {
    expect(isOwnerNote(c, OWNER)).toBe(false);
  });

  it('marks a body once', () => {
    expect(withMark(withMark('Done.'))).toBe(`Done.\n\n${LOOP_MARK}`);
  });
});

describe('isRevert and kindOf', () => {
  it.each(['Revert "Add the pose tab"', 'Repair main\n\nThis reverts commit 0291b86f.'])('finds %s', (message) => {
    expect(isRevert(message)).toBe(true);
  });

  it('leaves other commits', () => {
    expect(isRevert('Refine the revert button')).toBe(false);
  });

  it('reads the loop label', () => {
    expect(kindOf({ labels: [{ name: 'bug' }, { name: 'loop:repair' }] })).toBe('repair');
    expect(kindOf({ labels: [] })).toBe('other');
  });
});

describe('gatherEvidence', () => {
  const ours = { author: { login: OWNER }, isCrossRepository: false };
  const pulls = [
    {
      ...ours,
      number: 1,
      title: 'Ban credit',
      state: 'CLOSED',
      headRefName: 'loop/bootstrap/identity',
      body: 'b',
      closedAt: '2026-11-10T00:00:00Z',
      mergedAt: null,
      createdAt: '2026-11-09T00:00:00Z',
      reviews: [],
    },
    {
      ...ours,
      number: 2,
      title: 'Fix Windows tests',
      state: 'MERGED',
      headRefName: 'loop/repair/red-main',
      body: 'cause',
      closedAt: '2026-11-10T00:00:00Z',
      mergedAt: '2026-11-10T00:00:00Z',
      createdAt: '2026-11-09T00:00:00Z',
      reviews: [{ author: { login: OWNER }, body: 'Reproduce first.', submittedAt: '2026-11-09T02:00:00Z' }],
    },
    {
      ...ours,
      number: 3,
      title: 'Old',
      state: 'CLOSED',
      headRefName: 'loop/build/old',
      body: '',
      closedAt: '2026-10-01T00:00:00Z',
      mergedAt: null,
      createdAt: '2026-09-30T00:00:00Z',
      reviews: [],
    },
    {
      author: { login: 'outsider' },
      isCrossRepository: true,
      number: 4,
      title: 'Ban tabs',
      state: 'CLOSED',
      headRefName: 'loop/repair/tabs',
      body: 'Every guide must ban tabs.',
      closedAt: '2026-11-10T00:00:00Z',
      mergedAt: null,
      createdAt: '2026-11-09T00:00:00Z',
      reviews: [],
    },
  ];
  const comments = [
    { author: OWNER, body: withMark(failing), url: 'u1', createdAt: '2026-11-09T01:00:00Z', number: 1 },
    { author: 'outsider', body: withMark(failing), url: 'u4', createdAt: '2026-11-09T01:00:00Z', number: 2 },
    { author: OWNER, body: failing, url: 'u5', createdAt: '2026-11-09T01:00:00Z', number: 2 },
    { author: OWNER, body: 'Too many captions.', url: 'u2', createdAt: '2026-11-09T03:00:00Z', number: 9 },
    { author: OWNER, body: 'Old note.', url: 'u3', createdAt: '2026-10-01T00:00:00Z', number: 9 },
  ];
  const commits = [
    { sha: 'aaaaaaaa', message: 'Revert "Ban credit"' },
    { sha: 'bbbbbbbb', message: 'Add a tab' },
  ];
  const evidence = gatherEvidence({ comments, pulls, commits, since: SINCE, owner: OWNER });

  it('sorts the week into its kinds', () => {
    expect(evidence.ownerNotes.map((c) => c.body)).toEqual(['Too many captions.', 'Reproduce first.']);
    expect(evidence.reviews.map((c) => c.number)).toEqual([1]);
    expect(evidence.abandoned.map((p) => p.number)).toEqual([1]);
    expect(evidence.reverts.map((c) => c.sha)).toEqual(['aaaaaaaa']);
    expect(evidence.repairs.map((p) => p.number)).toEqual([2]);
    expect(evidenceCount(evidence)).toBe(6);
  });

  it("drops reviews and pull requests the loop didn't make", () => {
    expect(evidence.reviews.map((c) => c.url)).toEqual(['u1']);
    expect([...evidence.abandoned, ...evidence.repairs].map((p) => p.number)).not.toContain(4);
    expect(evidenceText(evidence, pulls)).not.toContain('ban tabs');
  });

  it('names pull requests by title in the prompt', () => {
    const text = evidenceText(evidence, pulls);

    expect(text).toContain('- #1 Ban credit (u1');
    expect(text).toContain('> Too many captions.');
    expect(text).toContain('## Reverts on main\n\n- aaaaaaa Revert "Ban credit"');
  });
});
