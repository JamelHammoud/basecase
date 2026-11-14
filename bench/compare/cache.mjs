import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

export const HARNESS_EXCLUDES = [
  ':(exclude)**/*.test.*',
  ':(exclude)**/*.css',
  ':(exclude)**/*.md',
  ':(exclude)**/AGENTS.md',
];

export const AGENT_PATHS = [
  'electron/cad-agent-prompt.mjs',
  'electron/cad-agent-guides',
  'electron/cad-mcp-server.mjs',
  'electron/cad-mcp',
  'electron/cad-kernel',
  'electron/acp-3d-agent.mjs',
  'electron/acp-3d-model.mjs',
  'src/assembly',
  'src/readiness',
];

export const HARNESS_PATHS = [
  ...AGENT_PATHS,
  'electron/cadImport',
  'electron/backend',
  'electron/robot-skeleton.mjs',
  'electron/publicFetch.mjs',
  'src/agent',
  'src/data',
  'src/print',
  'src/robot',
  'src/three',
  'src/types',
  'src/utils',
  'src/workspace',
  'bench/micro',
  'public/parts',
  'package-lock.json',
  'vite.config.ts',
  ...HARNESS_EXCLUDES,
];

const git = (cwd, args, env) => execFileSync('git', args, { cwd, env, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });

function untrackedDigest(cwd, paths) {
  const files = git(cwd, ['ls-files', '--others', '--exclude-standard', '--', ...paths])
    .split('\n')
    .filter(Boolean)
    .sort();
  const hash = crypto.createHash('sha256');

  for (const file of files) hash.update(file).update(fs.readFileSync(path.join(cwd, file)));

  return hash.digest('hex');
}

const keyOf = ({ staged, changed, untracked }) =>
  crypto.createHash('sha256').update(staged).update(changed).update(untracked).digest('hex').slice(0, 16);

export const harnessKey = (cwd, paths = HARNESS_PATHS) =>
  keyOf({
    staged: git(cwd, ['ls-files', '-s', '--', ...paths]),
    changed: git(cwd, ['diff', 'HEAD', '--', ...paths]),
    untracked: untrackedDigest(cwd, paths),
  });

export function harnessKeyAt(cwd, commit, paths = HARNESS_PATHS) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-index-'));
  const env = { ...process.env, GIT_INDEX_FILE: path.join(dir, 'index') };

  try {
    git(cwd, ['read-tree', commit], env);

    return keyOf({
      staged: git(cwd, ['ls-files', '-s', '--', ...paths], env),
      changed: '',
      untracked: crypto.createHash('sha256').digest('hex'),
    });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

const canonical = (id) =>
  String(id ?? '')
    .toLowerCase()
    .replace(/\[[^\]]*\]$/, '')
    .replace(/\./g, '-');

const reusable = (e) => e.grade === 'pass' || e.grade === 'fail' || e.grade === 'unavailable';

export function cachedRuns(entries, { harness, effort, served }) {
  const byTask = new Map();

  if (!harness || !served) return byTask;

  const matches = entries
    .filter((e) => e.kind === 'micro' && e.harness === harness && (e.effort ?? null) === (effort ?? null))
    .filter((e) => canonical(e.servedBy) === canonical(served) && reusable(e))
    .sort((a, b) => a.at.localeCompare(b.at));

  for (const e of matches) byTask.set(e.task, [...(byTask.get(e.task) ?? []), e]);

  return byTask;
}

export function runFromCache(entry, label) {
  return {
    task: entry.task,
    seed: entry.seed,
    status: entry.grade,
    costUsd: entry.costUsd,
    seconds: entry.seconds,
    tokens: entry.tokens,
    servedBy: entry.servedBy,
    model: label,
    cached: entry.run,
  };
}
