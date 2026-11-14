import { plural } from '../../../electron/plural.mjs';
import { failedTests } from './flakes.mjs';

const ANSI = new RegExp(`(?:${String.fromCharCode(27)}|\\^\\[)\\[[0-9;]*m`, 'g');
const OUT_OF_TIME = /exceeded the maximum execution time/;

const ranOutOfTime = (annotations) => annotations.some((message) => OUT_OF_TIME.test(message));

export const withTimeouts = (jobs, annotationsOf) =>
  jobs.map((job) =>
    job.conclusion === 'cancelled' && ranOutOfTime(annotationsOf(job.id)) ? { ...job, conclusion: 'timed_out' } : job,
  );

export function jobsOf(combined) {
  const jobs = new Map();

  for (const line of combined.replace(ANSI, '').split('\n')) {
    const tab = line.indexOf('\t');

    if (tab < 0) continue;

    const name = line.slice(0, tab);

    jobs.set(name, `${jobs.get(name) ?? ''}${line.slice(tab + 1)}\n`);
  }

  return [...jobs].map(([name, log]) => ({ name, log }));
}

function shares(sizes, budget) {
  const order = sizes.map((size, index) => ({ size, index })).sort((a, b) => a.size - b.size);
  const given = Array.from({ length: sizes.length }, () => 0);
  let left = budget;

  order.forEach(({ size, index }, rank) => {
    given[index] = Math.min(size, Math.floor(left / (order.length - rank)));
    left -= given[index];
  });

  return given;
}

export function failureDigest(jobs, maxChars) {
  if (jobs.length === 0) return '';

  const clean = jobs.map(({ name, log, timedOut }) => ({ name, log: log.replace(ANSI, ''), timedOut }));
  const summary = clean.map(({ name, log, timedOut }) => {
    const tests = failedTests(log);
    const named = tests.length > 0 ? tests.join('; ') : 'no failed test named; read its log';

    return `- ${name}: ${timedOut ? `ran past its timeout, so GitHub cancelled it. ${named}` : named}`;
  });
  const header = `${plural(clean.length, 'job')} failed:\n${summary.join('\n')}`;
  const titles = clean.map(({ name }) => `\n\n## ${name}\n\n`);
  const room = Math.max(0, maxChars - header.length - titles.join('').length);
  const given = shares(
    clean.map(({ log }) => log.length),
    room,
  );

  return header + clean.map(({ log }, index) => titles[index] + log.slice(log.length - given[index])).join('');
}
