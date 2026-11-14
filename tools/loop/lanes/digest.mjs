import { conflictLog, conflictsByFile } from '../lib/conflicts.mjs';
import { createIssue, issues } from '../lib/github.mjs';
import {
  DAY_MS,
  HOUR_MS,
  issueComments,
  issuesSince,
  latestIssue,
  mainCheckRuns,
  mainCommits,
  pullsSince,
  windowStart,
} from '../lib/history.mjs';
import { OWNER_LOGIN } from '../lib/paths.mjs';
import { digestBody, digestTitle, parseDigest, weekStats } from '../lib/stats.mjs';

export const schedule = {
  slots: 1,
  everySeconds: 24 * 60 * 60,
  labels: ['loop:digest'],
  does: "Posts the week's numbers per lane, against last week's, as a loop:digest issue, once a week",
};

const DIGEST = 'loop:digest';
const EVERY_MS = 7 * DAY_MS - 2 * HOUR_MS;

export default function digest({ log }) {
  const now = Date.now();
  const last = latestIssue(DIGEST);

  if (last && now - Date.parse(last.createdAt) < EVERY_MS) {
    log(`this week's digest is out (${last.createdAt})`);

    return;
  }

  const from = windowStart(7, now);
  const to = windowStart(0, now);
  const lookback = windowStart(14, now);
  const stats = weekStats({
    pulls: pullsSince(lookback),
    comments: issueComments(lookback),
    commits: mainCommits(lookback),
    runs: mainCheckRuns(),
    steps: issuesSince(from),
    openSteps: issues('loop:next').length,
    owner: OWNER_LOGIN,
    from,
    to,
    previous: parseDigest(last?.body),
    conflicts: conflictsByFile(conflictLog.all(), { from, to }),
  });
  const url = createIssue({ title: digestTitle(from), body: digestBody(stats), labels: [DIGEST] });

  log(`digest ${url}${stats.worst ? `, worst: ${stats.worst.lane} ${stats.worst.measure}` : ''}`);
}
