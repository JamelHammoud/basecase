const NONE = 'None.';

const value = (number, unit = '') => (number === null || number === undefined ? '–' : `${number}${unit}`);

const percent = (share) => `${Math.round(share * 100)}%`;

const table = (head, rows) =>
  rows.length === 0
    ? NONE
    : [
        `| ${head.join(' | ')} |`,
        `|${head.map(() => '---').join('|')}|`,
        ...rows.map((r) => `| ${r.join(' | ')} |`),
      ].join('\n');

const section = (title, body) => `## ${title}\n\n${body || NONE}`;

const counts = (pairs) => pairs.map(([name, n]) => `${name} ${n}`).join(', ') || NONE;

const laneRows = (lanes) =>
  lanes.map((l) => [
    l.lane,
    l.runs,
    l.worked,
    l.declined,
    percent(l.idleRatio),
    `${l.crashes} + ${l.sessionFailures} (${percent(l.crashRate)})`,
    value(l.medianMinutes === null ? null : Math.round(l.medianMinutes)),
    value(l.maxMinutes === null ? null : Math.round(l.maxMinutes)),
  ]);

const laneErrors = (lanes) =>
  lanes
    .filter((l) => l.errors.length > 0)
    .map(
      (l) =>
        `- **${l.lane}**: ${l.errors
          .slice(0, 4)
          .map(([key, n]) => `${n}× ${key}`)
          .join('; ')}`,
    )
    .join('\n');

const spreadRow = (name, s) => [name, s.count, value(s.median), value(s.p90), value(s.max)];

const items = (list, line) => list.map(line).join('\n') || NONE;

function lanesSection(evidence) {
  return [
    table(
      ['Lane', 'Runs', 'Worked', 'Declined', 'Nothing to do', 'Crashes + failed sessions', 'Median min', 'Max min'],
      laneRows(evidence.lanes),
    ),
    "Minutes are per working run: exact where the runner logged `took`, else the gap since that slot's previous line.",
    laneErrors(evidence.lanes),
    evidence.launchd.length > 0
      ? `launchd stderr: ${evidence.launchd.map((l) => `\`${l.file}\` …${l.tail}`).join('\n')}`
      : '',
  ]
    .filter(Boolean)
    .join('\n\n');
}

function pullsSection({ pulls }) {
  return [
    `Opened ${pulls.opened}, still open ${pulls.open}. Merged size in lines: median ${value(pulls.sizes.median)}, p90 ${value(pulls.sizes.p90)}, ${pulls.sizes.underTwentyLines} under 20 lines.`,
    table(
      ['Kind', 'Merged', 'Median h to merge', 'p90 h', 'Max h'],
      pulls.mergeHours.map((k) => spreadRow(k.kind, k)),
    ),
    `Closed without merging (${pulls.closed.length}):\n${items(pulls.closed, (p) => `- #${p.number} ${p.title}`)}`,
  ].join('\n\n');
}

function reviewsSection({ reviews }) {
  return [
    `Verdicts: ${counts(reviews.verdicts)}. Blockers by type: ${counts(reviews.blockerTypes)}.`,
    items(reviews.blockerSamples, (b) => `- #${b.number}: ${b.text}`),
  ].join('\n\n');
}

function ciSection({ ci, redHours }) {
  const { queue } = ci;

  return [
    `Hours \`main\`'s Check was red: ${redHours.toFixed(1)}. Runs waiting now: ${queue.waitingNow}, oldest ${value(queue.oldestWaitingMinutes, ' min')}.`,
    table(
      ['Queue minutes', 'Runs', 'Median', 'p90', 'Max'],
      [spreadRow('First job of a run', queue.firstJob), spreadRow('Any job', queue.anyJob)],
    ),
    items(ci.runs, (r) => `- ${r.event}: ${r.runs} Check runs (${counts(r.byConclusion)})`),
  ].join('\n\n');
}

const duplicateLine = (d) => `- #${d.a} and #${d.b} (${d.score}): ${d.title} / ${d.other}`;

export function retroText(evidence) {
  return [
    `# The loop, ${evidence.from.slice(0, 10)} to ${evidence.to.slice(0, 10)}`,
    section(
      'Digests',
      items(evidence.digests, (d) => `### #${d.number} ${d.title}\n\n${d.body}`),
    ),
    section('Lanes', lanesSection(evidence)),
    section('Pull requests', pullsSection(evidence)),
    section('Reviews', reviewsSection(evidence)),
    section(
      'Reverts on main',
      items(evidence.reverts, (r) => `- ${r}`),
    ),
    section('CI', ciSection(evidence)),
    section(
      'Steps waiting longest',
      items(
        evidence.steps,
        (s) => `- #${s.number} ${s.title}: ${s.hours} h${s.building ? ', building' : ''}, declined ${s.declines}×`,
      ),
    ),
    section(
      "Jamel's comments",
      items(evidence.ownerNotes, (c) => `- #${c.number} (${c.at}): ${c.body.replace(/\s+/g, ' ')}`),
    ),
    section(
      'Near-duplicate titles',
      [
        `Pull requests:\n${items(evidence.duplicates.pulls.slice(0, 15), duplicateLine)}`,
        `Issues:\n${items(evidence.duplicates.issues.slice(0, 15), duplicateLine)}`,
      ].join('\n\n'),
    ),
    section(
      'Loop pull requests already open',
      items(evidence.pulls.openLoop, (p) => `- #${p.number} ${p.title}`),
    ),
  ].join('\n\n');
}
