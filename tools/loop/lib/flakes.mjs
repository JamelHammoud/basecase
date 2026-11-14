const ANSI = new RegExp(`(?:${String.fromCharCode(27)}|\\^\\[)\\[[0-9;]*m`, 'g');
const FAILED = /\bFAIL\s+(\S+\.test\.[cm]?[jt]sx?)\s+>\s+(.+?)\s*$/;

export function failedTests(log) {
  const found = new Set();

  for (const line of log.replace(ANSI, '').split('\n')) {
    const match = FAILED.exec(line);

    if (match) found.add(`${match[1]} > ${match[2]}`);
  }

  return [...found];
}

export const SLOW_TEST_MS = 30_000;

const PASSED = /✓\s+(.+?)\s+(\d+)ms\s*$/;

export function slowTests(log, limitMs = SLOW_TEST_MS) {
  const found = new Map();

  for (const line of log.replace(ANSI, '').split('\n')) {
    const match = PASSED.exec(line);

    if (!match || /\(\d+ tests?\b/.test(match[1])) continue;

    const ms = Number(match[2]);

    if (ms > limitMs) found.set(match[1], Math.max(ms, found.get(match[1]) ?? 0));
  }

  return [...found].map(([name, ms]) => ({ name, ms }));
}

export function slowStep({ name, ms }, runUrl) {
  return {
    title: `Fix: Speed up or delete the slow test "${name}"`,
    body: [
      'Kind: fix',
      '',
      `\`${name}\` took ${Math.round(ms / 1000)} s on ${runUrl}. Every pull request's full Check waits on its slowest shard, so a test over ${SLOW_TEST_MS / 1000} s slows every merge.`,
      '',
      'Delete it if a unit test or a faster e2e test already covers what users rely on, or if it checks a narrow detail. Otherwise cut it to the one thing it proves. Never raise a timeout or add a retry.',
    ].join('\n'),
  };
}

export const isTrainRun = (runInfo) => runInfo.headBranch === 'main' || runInfo.headBranch.startsWith('loop/batch/');

export const passedOnRerun = (runInfo) =>
  runInfo.conclusion === 'success' && runInfo.attempt >= 2 && isTrainRun(runInfo);

export function flakeStep(test, runUrl) {
  const [file, ...names] = test.split(' > ');
  const name = names.at(-1);

  return {
    title: `Fix: Make the flaky test "${name}" in ${file} deterministic`,
    body: [
      'Kind: fix',
      '',
      `\`${test}\` failed on ${runUrl} and passed when its failed jobs ran again, so it fails at random and stops the merge train.`,
      '',
      'Find why it depends on timing or the machine and fix that, in the test or the app. Never raise a timeout, add a retry or skip the test to make it pass. If it covers nothing another test does not, delete it and say why.',
    ].join('\n'),
  };
}
