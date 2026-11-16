import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export { default as kit } from './fixtures/e2e-kit-93e274222.mjs';
export const cases = `import { describe, it, test, expect } from ${JSON.stringify(path.join(root, 'node_modules/vitest/dist/index.js'))};
const itUnlessWindows = it.skipIf(false);
describe('outer', () => {
  it('neighbor before', () => { expect(true).toBe(true); });
  describe('inner', () => {
    it.each(['desktop', 'web'])(
      'exports an arm through Export on %s with matching manufacturing identities',
      () => { expect(true).toBe(true); },
    );
    test.skipIf(false).each([{ name: 'one', value: 1 }, { name: 'two', value: 2 }])(
      'object $name $value', () => { expect(true).toBe(true); },
    );
    test.each\`name | value
      \${'a'} | \${1}
      \${'b'} | \${2}
    \`('table $name $value', () => { expect(true).toBe(true); });
    itUnlessWindows('wrapped', () => { expect(true).toBe(true); });
    it.each(['color: red'])('styled %c text', () => { expect(true).toBe(true); });
    test.runIf(true)(\`escaped \\n \\u0061 \\x62 \\\`\`, () => { expect(true).toBe(true); });
    it('neighbor after', () => { expect(true).toBe(true); });
  });
});`;

export function fixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'browser-selector-'));
  const git = (args, input) =>
    execFileSync('git', args, {
      cwd: dir,
      encoding: 'utf8',
      input,
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: 'Fixture',
        GIT_AUTHOR_EMAIL: 'fixture@example.com',
        GIT_COMMITTER_NAME: 'Fixture',
        GIT_COMMITTER_EMAIL: 'fixture@example.com',
      },
    }).trim();
  const write = (file, source) => {
    fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    fs.writeFileSync(path.join(dir, file), source);
  };
  const revision = () => {
    git(['add', '.']);

    const tree = git(['write-tree']);
    const parent = fs.existsSync(path.join(dir, '.git/refs/heads/main')) ? ['-p', 'HEAD'] : [];
    const sha = git(['commit-tree', tree, ...parent], 'fixture\n');

    git(['update-ref', 'refs/heads/main', sha]);

    return sha;
  };

  git(['init', '-q', '-b', 'main']);
  write(
    'vitest.e2e.config.ts',
    `export default { test: { root: ${JSON.stringify(dir)}, include: ['e2e/**/*.e2e.test.ts'], environment: 'node' } };`,
  );

  return { dir, write, revision, close: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

export function vitest(fix, args) {
  const report = path.join(fix.dir, 'report.json');

  execFileSync(
    process.execPath,
    [
      path.join(root, 'node_modules/vitest/vitest.mjs'),
      ...args,
      '--config',
      path.join(fix.dir, 'vitest.e2e.config.ts'),
      '--reporter=json',
      '--outputFile',
      report,
    ],
    { cwd: fix.dir, stdio: 'pipe' },
  );

  return JSON.parse(fs.readFileSync(report, 'utf8'));
}

export const executed = (report) =>
  report.testResults.flatMap((file) =>
    file.assertionResults
      .filter((test) => test.status === 'passed')
      .map((test) => [...test.ancestorTitles, test.title].join(' > ')),
  );
