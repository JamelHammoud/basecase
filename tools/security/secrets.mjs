import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { finding, has, parseJson, root, run } from './run.mjs';

const MAX_BYTES = 2 * 1024 * 1024;
const SKIP = /(^|\/)(package-lock\.json|uv\.lock)$|\.(glb|png|jpe?g|webp|ico|icns|car|stl|3mf|wasm|pdf|zip)$/i;

const PATTERNS = [
  ['Anthropic API key', /sk-ant-(?:api|admin)\d{2}-[\w-]{80,}/],
  ['OpenAI API key', /sk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{20}T3BlbkFJ[A-Za-z0-9_-]{20,}/],
  ['Google API key', /AIza[0-9A-Za-z_-]{35}/],
  ['GitHub token', /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_\w{60,})\b/],
  ['AWS access key', /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/],
  ['Slack token', /\bxox[abpors]-[A-Za-z0-9-]{10,}/],
  ['Hugging Face token', /\bhf_[A-Za-z0-9]{34,}\b/],
  ['Stripe secret key', /\b[rs]k_live_[A-Za-z0-9]{20,}/],
  ['Private key', /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----/],
];

const SECRET_FILES = /(^|\/)(\.env(\..+)?|auth\.json|agent-keys\.json|printer-keys\.json|id_(rsa|ed25519))$/;

function candidateFiles() {
  return run('git', ['ls-files', '--cached', '--others', '--exclude-standard'])
    .stdout.split('\n')
    .filter((file) => file && !SKIP.test(file) && !file.startsWith('tools/security/'));
}

function scanFile(file) {
  const full = path.join(root, file);
  const stat = fs.statSync(full, { throwIfNoEntry: false });

  if (!stat?.isFile() || stat.size > MAX_BYTES) return [];

  const text = fs.readFileSync(full, 'utf8');

  return PATTERNS.filter(([, pattern]) => pattern.test(text)).map(([label]) =>
    finding(
      'critical',
      `${label} in ${file}`,
      'Committed or about to be',
      'Revoke it now, then remove it from the file and from git history',
    ),
  );
}

function gitleaksFindings() {
  if (!has('gitleaks')) {
    return [finding('info', 'gitleaks not installed', 'Git history was not scanned', 'brew install gitleaks')];
  }

  const report = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'basecase-leaks-')), 'report.json');

  run('gitleaks', ['git', '--no-banner', '--redact', '--report-format', 'json', '--report-path', report, '.']);

  const leaks = fs.existsSync(report) ? (parseJson(fs.readFileSync(report, 'utf8')) ?? []) : [];

  fs.rmSync(path.dirname(report), { recursive: true, force: true });

  return leaks.map((leak) =>
    finding(
      'critical',
      `${leak.Description} in ${leak.File}:${leak.StartLine}`,
      `Commit ${String(leak.Commit).slice(0, 10)}`,
      'Revoke the secret; history rewrites do not un-leak it',
    ),
  );
}

export function secretsScan() {
  const files = candidateFiles();
  const named = files
    .filter((file) => SECRET_FILES.test(file))
    .map((file) =>
      finding('critical', `Secret file not ignored: ${file}`, '', 'Add it to .gitignore and git rm --cached it'),
    );

  return { name: 'Secrets', findings: [...named, ...files.flatMap(scanFile), ...gitleaksFindings()] };
}
