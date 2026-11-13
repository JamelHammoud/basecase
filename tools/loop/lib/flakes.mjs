const ANSI = new RegExp(`(?:${String.fromCharCode(27)}|\\^\\[)\\[[0-9;]*m`, 'g');
const FAILED = /\bFAIL\s+(\S+\.test\.ts)\s+>\s+(.+?)\s*$/;

export function failedTests(log) {
  const found = new Set();

  for (const line of log.replace(ANSI, '').split('\n')) {
    const match = FAILED.exec(line);

    if (match) found.add(`${match[1]} > ${match[2]}`);
  }

  return [...found];
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
