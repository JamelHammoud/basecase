import { LOOP_MARK } from './mark.mjs';

export const REVIEW_HEAD = '### Review:';

const VERDICT = /^### Review: (pass|changes needed)(?: \(([0-9a-f]{7,40})\))?/;
const FINDING = /^- \*\*(blocker|minor)\*\*/gm;
const REVERT = /^Revert "|^This reverts commit [0-9a-f]{7,40}/m;
const CLIP = 3000;

export const isReviewComment = (body = '') => body.trimStart().startsWith(REVIEW_HEAD);

export function parseReview(body = '') {
  const head = VERDICT.exec(body.trimStart());

  if (!head) return null;

  const severities = [...body.matchAll(FINDING)].map((match) => match[1]);

  return {
    verdict: head[1] === 'pass' ? 'pass' : 'fail',
    sha: head[2] ?? null,
    blockers: severities.filter((s) => s === 'blocker').length,
    minors: severities.filter((s) => s === 'minor').length,
  };
}

export const isOwnerNote = (comment, owner) =>
  comment.author === owner && !isReviewComment(comment.body) && !comment.body.includes(LOOP_MARK);

export const isLoopReview = (comment, owner) =>
  comment.author === owner && isReviewComment(comment.body) && comment.body.includes(LOOP_MARK);

export const isLoopPull = (pull, owner) =>
  pull.author?.login === owner && pull.isCrossRepository === false && Boolean(pull.headRefName?.startsWith('loop/'));

export const isRevert = (message = '') => REVERT.test(message);

export const kindOf = (pull) =>
  pull.labels
    ?.map((label) => label.name)
    .find((name) => name.startsWith('loop:'))
    ?.slice('loop:'.length) ?? 'other';

export const reviewNotes = (pulls) =>
  pulls.flatMap((pull) =>
    (pull.reviews ?? [])
      .filter((review) => review.body?.trim())
      .map((review) => ({
        author: review.author?.login,
        body: review.body,
        url: `#${pull.number}`,
        createdAt: review.submittedAt,
        number: pull.number,
      })),
  );

const inWindow = (at, since) => Boolean(at) && at >= since;

export function gatherEvidence({ comments, pulls, commits, since, owner }) {
  const recent = comments.filter((c) => inWindow(c.createdAt, since));
  const notes = [...recent, ...reviewNotes(pulls).filter((c) => inWindow(c.createdAt, since))];
  const loopPulls = pulls.filter((p) => isLoopPull(p, owner));

  return {
    ownerNotes: notes.filter((c) => isOwnerNote(c, owner)),
    reviews: recent.filter((c) => isLoopReview(c, owner)),
    abandoned: loopPulls.filter((p) => p.state === 'CLOSED' && !p.mergedAt && inWindow(p.closedAt, since)),
    reverts: commits.filter((c) => isRevert(c.message)),
    repairs: loopPulls.filter((p) => p.headRefName.startsWith('loop/repair/') && inWindow(p.createdAt, since)),
  };
}

export const evidenceCount = (evidence) => Object.values(evidence).reduce((sum, list) => sum + list.length, 0);

const clip = (text = '', chars = CLIP) => (text.length > chars ? `${text.slice(0, chars)}…` : text);

const quote = (text) =>
  clip(text)
    .split('\n')
    .map((line) => `> ${line}`)
    .join('\n');

const pullName = (titles, number) => (titles.has(number) ? `#${number} ${titles.get(number)}` : `#${number}`);

const section = (title, items) => [`## ${title}`, items.length > 0 ? items.join('\n\n') : 'None.'].join('\n\n');

export function evidenceText(evidence, pulls) {
  const titles = new Map(pulls.map((pull) => [pull.number, pull.title]));
  const comment = (c) => `- ${pullName(titles, c.number)} (${c.url}, ${c.createdAt})\n${quote(c.body)}`;
  const pull = (p) => `- #${p.number} ${p.title} (\`${p.headRefName}\`, ${p.state.toLowerCase()})\n${quote(p.body)}`;

  return [
    section("Jamel's comments (they weigh most: one is enough for a lesson)", evidence.ownerNotes.map(comment)),
    section('Review comments', evidence.reviews.map(comment)),
    section('Pull requests closed without merging', evidence.abandoned.map(pull)),
    section(
      'Reverts on main',
      evidence.reverts.map((c) => `- ${c.sha.slice(0, 7)} ${clip(c.message, 600)}`),
    ),
    section('Repair pull requests', evidence.repairs.map(pull)),
  ].join('\n\n');
}
