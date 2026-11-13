import { isLoopReview, isOwnerNote } from '../../../tools/loop/lib/evidence.mjs';
import { issueComments, issuesSince } from '../../../tools/loop/lib/history.mjs';
import { OWNER_LOGIN } from '../../../tools/loop/lib/paths.mjs';
import { json } from '../../../tools/loop/lib/sh.mjs';
import { commentCandidates, reviewCandidates } from './sources.mjs';

const isLoopItem = (item) => (item.labels ?? []).some((label) => label.name.startsWith('loop:'));

const pullList = (search, fields) =>
  json('gh', ['pr', 'list', '--state', 'all', '--limit', '500', '--search', search, '--json', fields]) ?? [];

export function evidenceSources(since) {
  const day = since.slice(0, 10);
  const merged = pullList(`merged:>=${day}`, 'number,mergedAt,files');
  const updated = pullList(`updated:>=${day}`, 'number,labels');

  return {
    comments: issueComments(since),
    pulls: merged,
    loopNumbers: new Set([...issuesSince(since), ...updated].filter(isLoopItem).map((item) => item.number)),
  };
}

export const githubCandidates = ({ comments, pulls, loopNumbers }) => ({
  review: reviewCandidates({ comments, pulls, isReview: (c) => isLoopReview(c, OWNER_LOGIN) }),
  comment: commentCandidates({ comments, loopNumbers, isOwnerNote: (c) => isOwnerNote(c, OWNER_LOGIN) }),
});
