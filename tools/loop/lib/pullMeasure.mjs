import { AGENT_PATHS, HARNESS_EXCLUDES } from '../../../bench/compare/cache.mjs';
import { SHARED_PATHS } from '../../../bench/compare/against.mjs';
import { costRise, gapText, measuredMarkdown, pullVerdict } from './harnessVerdict.mjs';
import { LOOP_MARK } from './mark.mjs';

export const MEASURE_HEAD = '### Micro-evals:';

const DATA = /<!-- micro-evals (\{.*?\}) -->/;
const HEADS = { worse: 'worse', 'no worse': 'no worse', inconclusive: 'not settled', skipped: 'not measured' };

const globPattern = (glob) =>
  new RegExp(
    `^${glob
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*\*\//g, '\0')
      .replace(/\*/g, '[^/]*')
      .replace(/\0/g, '(?:.*/)?')}$`,
  );

const EXCLUDED = HARNESS_EXCLUDES.map((spec) => globPattern(spec.replace(':(exclude)', '')));

const under = (roots) => (file) => roots.some((root) => file === root || file.startsWith(`${root}/`));

const inAgent = under(AGENT_PATHS);

const isShared = under(SHARED_PATHS.map((shared) => shared.path));

const counted = (file) => !EXCLUDED.some((re) => re.test(file));

export const agentFiles = (paths) => paths.filter((file) => inAgent(file) && counted(file));

export const isHarnessPull = (pull) => pull.headRefName.startsWith('loop/harness/');

export const needsMeasure = (pull, paths) => !isHarnessPull(pull) && agentFiles(paths).length > 0;

export function parseMeasure(body = '') {
  if (!body.trimStart().startsWith(MEASURE_HEAD)) return null;

  try {
    return JSON.parse(DATA.exec(body)?.[1] ?? 'null');
  } catch {
    return null;
  }
}

export function lastMeasure(comments, owner) {
  const found = comments
    .filter((comment) => comment.author === owner && comment.body.includes(LOOP_MARK))
    .map((comment) => ({ url: comment.url, body: comment.body, data: parseMeasure(comment.body) }))
    .filter((c) => c.data);

  return found.at(-1) ?? null;
}

const tableOf = (body) =>
  body
    .split('\n\n')
    .slice(2)
    .filter((part) => !part.startsWith('<!-- '))
    .join('\n\n');

export const deltaText = (data) => {
  const gap = data.ci ? gapText({ meanDiff: data.gap, ci: data.ci }) : 'no gap measured';
  const cost =
    typeof data.costRise === 'number'
      ? `, cost per pass ${data.costRise >= 0 ? '+' : '−'}${Math.abs(Math.round(data.costRise * 100))}%`
      : '';

  return `${HEADS[data.verdict]}: ${gap}${cost}`;
};

const reasonLine = ({ reason, sha, measuredAt }) =>
  [
    `${reason[0].toUpperCase()}${reason.slice(1)}.`,
    ...(measuredAt && measuredAt !== sha
      ? [`Measured at ${measuredAt.slice(0, 7)}; this head has the same harness, and so does \`main\`.`]
      : []),
  ].join(' ');

export const measureComment = (data, table = '') =>
  [
    `${MEASURE_HEAD} ${HEADS[data.verdict]} (${data.sha.slice(0, 7)})`,
    reasonLine(data),
    table,
    `<!-- micro-evals ${JSON.stringify(data)} -->`,
  ]
    .filter(Boolean)
    .join('\n\n');

const FIX =
  'Read the runs the micro-evals comment lists, find what the change made the agent do worse, and change the harness so the tune set passes at least as often as on `main`, at no more than 20% more cost per pass.';

export const outcomeOf = (data) =>
  data.verdict === 'worse'
    ? {
        verdict: 'fail',
        reason: `Micro-evals: ${data.reason}`,
        finding: {
          file: 'bench/micro',
          severity: 'blocker',
          problem: `The micro-evals measured this change worse than \`main\`: ${data.reason}.`,
          fix: FIX,
        },
      }
    : { verdict: 'pass', reason: `Micro-evals: ${data.reason}` };

const money = (value) => `$${value.toFixed(2)}`;

function skipCause({ paths, keys, spent }, deps) {
  const paused = deps.paused();

  if (paused) return paused;

  const shared = paths.filter((file) => isShared(file) && counted(file));

  if (shared.length > 0) return `it changes ${shared.join(', ')}, which both sides must share to be compared`;

  const total = deps.budget();
  const need = deps.estimate(keys);

  if (total - spent <= 0 || need > total - spent)
    return `settling needs about ${money(need)}, and ${money(Math.max(0, total - spent))} of this pull request's ${money(total)} is left`;

  return null;
}

function measured({ pull, sha, keys, paths, spent }, deps) {
  const base = { sha, branch: keys.branch, main: keys.main, spent };
  const skip = skipCause({ paths, keys, spent }, deps);

  if (skip) return { data: { ...base, verdict: 'skipped', reason: `not measured: ${skip}` } };

  const result = deps.compare({
    against: keys.mainCommit,
    budget: deps.budget() - spent,
    name: `review-${pull.number}-${sha.slice(0, 7)}`,
  });
  const after = { ...base, spent: spent + (result?.spent ?? 0) };

  if (!result)
    return { data: { ...after, verdict: 'skipped', reason: 'not measured: the compare ended without results' } };

  const decision = pullVerdict(result.stats);
  const data = {
    ...after,
    verdict: decision.verdict,
    reason: decision.reason,
    gap: result.stats.meanDiff,
    ci: result.stats.ci,
    costRise: costRise([result.stats]),
  };

  return { data, table: measuredMarkdown({ tune: result, settings: deps.settings, harness: keys, runs: result.runs }) };
}

const reusable = (last, keys) =>
  last &&
  ['worse', 'no worse'].includes(last.data.verdict) &&
  last.data.branch === keys.branch &&
  last.data.main === keys.main;

export function measurePull({ pull, paths, log }, deps) {
  if (!needsMeasure(pull, paths)) return null;

  const sha = pull.headRefOid;
  const last = lastMeasure(deps.pullComments(pull.number), deps.owner);

  if (last?.data.sha === sha) return outcomeOf(last.data);

  const keys = deps.keys();

  if (keys.branch === keys.main) return null;

  const spent = last?.data.spent ?? 0;
  const { data, table } = reusable(last, keys)
    ? { data: { ...last.data, sha, measuredAt: last.data.measuredAt ?? last.data.sha }, table: tableOf(last.body) }
    : measured({ pull, sha, keys, paths, spent }, deps);
  const body = measureComment(data, table);

  if (last) deps.editComment(last.url, body);
  else deps.commentOnPull(pull.number, body);

  log(`#${pull.number}: micro-evals ${data.reason}`);

  return outcomeOf(data);
}

export const judgedPass = (output) =>
  output.verdict === 'pass' && !output.findings.some((f) => f.severity === 'blocker');

export function withMeasure(output, measured) {
  const merged = {
    ...output,
    summary: measured ? `${output.summary}\n\n${measured.reason}.` : output.summary,
    findings: [...output.findings, ...(measured?.finding ? [measured.finding] : [])],
  };
  const verdict = judgedPass(output) && measured?.verdict !== 'fail' ? 'pass' : 'fail';

  return {
    output: merged,
    verdict,
    state: verdict === 'pass' ? 'success' : 'failure',
    description: measured?.verdict === 'fail' ? measured.reason : output.summary,
  };
}
