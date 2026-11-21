import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, expect, it } from 'vitest';

const directories = [];
const files = [
  'tools/quarantine-run.mjs',
  'tools/quarantine.mjs',
  'tools/quarantineShard.mjs',
  'tools/quarantineProcess.mjs',
  'electron/executables.mjs',
];

function fixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'basecase-quarantine-'));

  directories.push(directory);

  for (const file of files) {
    const destination = path.join(directory, file);

    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(new URL(`../${file}`, import.meta.url), destination);
  }

  const entries = ['src/probe.test.ts', 'e2e/probe.e2e.test.ts'].map((file) => ({
    file,
    test: 'observes fixture',
    issue: 1,
    until: '2099-01-01',
    reason: 'Observation fixture',
  }));

  for (const entry of entries) {
    const file = path.join(directory, entry.file);

    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, '');
  }

  fs.writeFileSync(path.join(directory, 'tools/quarantine.json'), JSON.stringify(entries));
  fs.mkdirSync(path.join(directory, 'node_modules/vitest'), { recursive: true });
  fs.writeFileSync(
    path.join(directory, 'node_modules/vitest/vitest.mjs'),
    `import fs from 'node:fs';
import path from 'node:path';
const output = process.argv.find(value => value.startsWith('--outputFile.json=')).split('=')[1];
const file = process.argv.at(-1);
const report = { testResults: [{ name: path.resolve(file), assertionResults: [
  { title: 'observes fixture', ancestorTitles: [], status: 'failed' }
] }] };
console.log('fixture observation ' + file);
fs.writeFileSync(output, process.env.PARTIAL_REPORT ? '{' : JSON.stringify(report));
fs.writeFileSync('spent', 'yes');
process.exitCode = 1;
`,
  );

  return directory;
}

function run(directory, { actions = false, partial = false, imports = [] } = {}) {
  return execFileSync(process.execPath, [...imports, 'tools/quarantine-run.mjs'], {
    cwd: directory,
    encoding: 'utf8',
    env: { ...process.env, GITHUB_ACTIONS: actions ? 'true' : '', PARTIAL_REPORT: partial ? 'true' : '' },
  });
}

afterEach(() => {
  for (const directory of directories.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

it('reports failed observations from both configurations without failing the command', () => {
  const output = run(fixture());

  expect(output).toContain('failed      src/probe.test.ts > observes fixture');
  expect(output).toContain('failed      e2e/probe.e2e.test.ts > observes fixture');
});

it('retains missing evidence when interrupted reports are partial JSON', () => {
  const output = run(fixture(), { partial: true });

  expect(output).toContain('did not run src/probe.test.ts > observes fixture');
  expect(output).toContain('did not run e2e/probe.e2e.test.ts > observes fixture');
});

it('shares the Actions budget across configurations and retains the completed first report', () => {
  const directory = fixture();

  fs.writeFileSync(
    path.join(directory, 'clock.mjs'),
    `import fs from 'node:fs';
const now = Date.now;
Date.now = () => now() + (fs.existsSync('spent') ? 45000 : 0);
`,
  );

  const output = run(directory, {
    actions: true,
    imports: ['--import', pathToFileURL(path.join(directory, 'clock.mjs')).href],
  });

  expect(output).toContain('failed      src/probe.test.ts > observes fixture');
  expect(output).toContain('did not run e2e/probe.e2e.test.ts > observes fixture');
  expect(output).not.toContain('fixture observation e2e/probe.e2e.test.ts');
  expect(output).toContain('Quarantine observation budget ended for vitest.e2e.config.ts.');
});
