import fs from 'node:fs';
import path from 'node:path';
import { finding, root, run } from './run.mjs';

const SOURCE = /^(src|electron|tools|bench|e2e)\/.*\.(ts|tsx|mjs|js|cjs|py)$/;
const EXCLUDED = /\.test\.|^tools\/security\/|^vendor\//;

const RULES = [
  ['high', 'Electron renderer gets Node', /nodeIntegration(InWorker|InSubFrames)?:\s*true/],
  ['high', 'Electron context isolation off', /contextIsolation:\s*false/],
  ['high', 'Electron sandbox off', /sandbox:\s*false/],
  ['high', 'Electron web security off', /webSecurity:\s*false|allowRunningInsecureContent:\s*true/],
  ['high', '<webview> enabled', /webviewTag:\s*true/],
  ['moderate', 'Shell spawn (injection risk)', /shell:\s*true|\bexecSync?\(\s*`/],
  ['moderate', 'TLS verification off', /rejectUnauthorized:\s*false|NODE_TLS_REJECT_UNAUTHORIZED/],
  [
    'moderate',
    'Unsafe deserialization',
    /torch\.load\((?![^)]*weights_only=True)|pickle\.loads?\(|yaml\.load\(|allow_pickle=True/,
  ],
  [
    'review',
    'Raw HTML sink',
    /dangerouslySetInnerHTML|\.innerHTML\s*=|\.outerHTML\s*=|insertAdjacentHTML|document\.write\(/,
  ],
  ['review', 'Dynamic code', /\bnew Function\(|\beval\(/],
  ['review', 'Opens external URL or path', /shell\.(openExternal|openPath)\(/],
  ['review', 'HTTP server listener', /\.listen\(/],
];

function scan(file) {
  const lines = fs.readFileSync(path.join(root, file), 'utf8').split('\n');

  return RULES.flatMap(([severity, label, pattern]) =>
    lines.flatMap((line, i) =>
      pattern.test(line)
        ? [finding(severity, `${label}: ${file}:${i + 1}`, line.trim().slice(0, 160), 'Check the input is trusted')]
        : [],
    ),
  );
}

function actionPins() {
  const workflows = path.join(root, '.github', 'workflows');
  const files = fs.existsSync(workflows) ? fs.readdirSync(workflows) : [];

  return files.flatMap((file) =>
    [...fs.readFileSync(path.join(workflows, file), 'utf8').matchAll(/uses:\s*([\w./-]+)@([\w.-]+)/g)]
      .filter((match) => !/^[0-9a-f]{40}$/.test(match[2]))
      .map((match) =>
        finding(
          'low',
          `Action pinned by tag: ${match[1]}@${match[2]} (${file})`,
          'A moved tag runs new code in CI',
          'Pin the full commit SHA, with the tag in a trailing note',
        ),
      ),
  );
}

export function codePatterns() {
  const files = run('git', ['ls-files', '--cached', '--others', '--exclude-standard'])
    .stdout.split('\n')
    .filter((file) => SOURCE.test(file) && !EXCLUDED.test(file) && fs.existsSync(path.join(root, file)));

  return { name: 'Code patterns', findings: [...files.flatMap(scan), ...actionPins()] };
}
