import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { ARCHIVE_LIMIT } from './lib/diagnosticContract.mjs';
import { collectDiagnostic, compareDiagnostic, submitDiagnostic } from './lib/diagnostics.mjs';
import { rememberDiagnostic } from './lib/diagnosticReadiness.mjs';
import { diagnosticJobLog } from './lib/diagnosticLog.mjs';
import { repo } from './lib/github.mjs';

const context = {
  cwd: process.cwd(),
  repository: repo(),
  workflowRef: process.argv[4] ?? 'main',
  api: (endpoint, body) => {
    const args = ['api', '-H', 'X-GitHub-Api-Version: 2026-03-10', endpoint, ...(body ? ['--input', '-'] : [])];
    const text = execFileSync('gh', args, {
      input: body ? JSON.stringify(body) : undefined,
      encoding: 'utf8',
      maxBuffer: 1024 * 1024,
      timeout: 60000,
    });

    return text.trim() ? JSON.parse(text) : null;
  },
  download: (endpoint) => execFileSync('gh', ['api', endpoint], { maxBuffer: ARCHIVE_LIMIT, timeout: 60000 }),
  log: (id) => diagnosticJobLog({ id, repository: repo() }),
};

try {
  const [command, value] = process.argv.slice(2);

  if (!['submit', 'collect'].includes(command) || !value)
    throw new Error(
      'Usage: node tools/loop/diagnostic.mjs submit <selection.json> [published-workflow-ref] | collect <ticket> [full-check-run-id]',
    );

  const result =
    command === 'submit'
      ? submitDiagnostic(JSON.parse(fs.readFileSync(value, 'utf8')), context)
      : await collectDiagnostic(value, context);

  rememberDiagnostic(result);

  if (command === 'collect' && result.state === 'completed' && process.argv[4])
    result.comparison = compareDiagnostic(result, Number(process.argv[4]), context);

  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exitCode = result.error ? 1 : 0;
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}
