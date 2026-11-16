export const ARCHIVE_LIMIT = 20 * 1024 * 1024;
export const FILE_LIMIT = 1024 * 1024;

const KEYS = ['revision', 'platform', 'file', 'test', 'runs', 'workers', 'ticket'];
const TEST_FILE = /^(?:e2e|src|electron|tools|bench|verify)\/(?:[\w.-]+\/)*[\w.-]+\.test\.(?:ts|mjs)$/;
const boundedInteger = (value, maximum) => Number.isInteger(value) && value >= 1 && value <= maximum;
const validName = (name) => typeof name === 'string' && name.trim().length > 0 && name.length <= 500;
const validFile = (file) =>
  typeof file === 'string' &&
  TEST_FILE.test(file) &&
  !file.split('/').some((part) => part === '..' || part === '.') &&
  !file.startsWith('e2e/app/') &&
  !file.endsWith('.perf.test.ts');

export function diagnosticSelection(input) {
  const { revision, platform, file, test, runs = 1, workers = 1, ticket } = input;
  const valid =
    Object.keys(input).every((key) => KEYS.includes(key)) &&
    /^[a-f0-9]{40}$/.test(revision ?? '') &&
    ['windows', 'linux'].includes(platform) &&
    validFile(file) &&
    validName(test) &&
    boundedInteger(runs, 30) &&
    boundedInteger(workers, 6) &&
    (ticket === undefined || /^[a-zA-Z0-9-]{1,80}$/.test(ticket));

  if (!valid)
    throw new Error(
      'Select a published commit SHA, Linux or Windows, a test file, an exact full test name, 1–30 measurements and 1–6 workers',
    );

  return { revision, platform, file, test, runs, workers, ...(ticket ? { ticket } : {}) };
}

export const configFor = (file) => (file.startsWith('e2e/') ? 'vitest.e2e.config.ts' : 'vitest.config.ts');
export const literalTestPattern = (name) => `^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`;

const ENVIRONMENT =
  /^(?:PATH|HOME|USERPROFILE|APPDATA|LOCALAPPDATA|TEMP|TMP|TMPDIR|SystemRoot|WINDIR|COMSPEC|PATHEXT|NUMBER_OF_PROCESSORS|PROCESSOR_ARCHITECTURE|PLAYWRIGHT_BROWSERS_PATH)$/i;

export const diagnosticEnvironment = (environment) => ({
  ...Object.fromEntries(Object.entries(environment).filter(([name]) => ENVIRONMENT.test(name))),
  CI: 'true',
  BASECASE_QUARANTINE: 'off',
});
