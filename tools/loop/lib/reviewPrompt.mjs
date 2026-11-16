import { copyReviewEvidence } from './copy.mjs';

export const reviewPrompt = ({ pull, where, copy, duplicates, fix, diff }) =>
  `Review pull request #${pull.number}: ${pull.title}\n\n${pull.body}\n\n${where}\n\n${copyReviewEvidence(copy)}\n\n${duplicates}\n\n${fix}\n\nIts diff against main:\n\n${diff}`;
