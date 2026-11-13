import { createIssue, issues } from '../lib/github.mjs';
import {
  DAY_MS,
  HOUR_MS,
  issueComments,
  latestIssueAt,
  mainCheckRuns,
  mainCommits,
  pullsSince,
  windowStart,
} from '../lib/history.mjs';
import { OWNER_LOGIN } from '../lib/paths.mjs';
import { digestTable, digestTitle, weekStats } from '../lib/stats.mjs';

const DIGEST = 'loop:digest';
const EVERY_MS = 7 * DAY_MS - 2 * HOUR_MS;

export default function digest({ log }) {
  const now = Date.now();
  const last = latestIssueAt(DIGEST);

  if (last && now - Date.parse(last) < EVERY_MS) {
    log(`this week's digest is out (${last})`);

    return;
  }

  const from = windowStart(7, now);
  const to = windowStart(0, now);
  const stats = weekStats({
    pulls: pullsSince(from),
    comments: issueComments(from),
    commits: mainCommits(from),
    runs: mainCheckRuns(),
    openSteps: issues('loop:next').length,
    owner: OWNER_LOGIN,
    from,
    to,
  });
  const url = createIssue({ title: digestTitle(from), body: digestTable(stats), labels: [DIGEST] });

  log(`digest ${url}`);
}
