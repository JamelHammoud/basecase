import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

export const HARNESS_PATHS = [
  'electron/cad-agent-prompt.mjs',
  'electron/cad-agent-guides',
  'electron/cad-mcp-server.mjs',
  'electron/cad-mcp',
  'electron/cad-kernel',
  'electron/cadImport',
  'electron/backend',
  'electron/acp-3d-agent.mjs',
  'electron/acp-3d-model.mjs',
  'electron/robot-skeleton.mjs',
  'electron/publicFetch.mjs',
  'src/agent',
  'src/assembly',
  'src/data',
  'src/print',
  'src/readiness',
  'src/robot',
  'src/three',
  'src/types',
  'src/utils',
  'src/workspace',
  'bench/micro',
  'public/parts',
  'package-lock.json',
  'vite.config.ts',
  ':(exclude)**/*.test.*',
  ':(exclude)**/*.css',
  ':(exclude)**/*.md',
  ':(exclude)**/AGENTS.md',
];

const git = (cwd, args) => execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });

function untrackedDigest(cwd) {
  const files = git(cwd, ['ls-files', '--others', '--exclude-standard', '--', ...HARNESS_PATHS])
    .split('\n')
    .filter(Boolean)
    .sort();
  const hash = crypto.createHash('sha256');

  for (const file of files) hash.update(file).update(fs.readFileSync(path.join(cwd, file)));

  return hash.digest('hex');
}

export function harnessKey(cwd) {
  const hash = crypto.createHash('sha256');

  hash.update(git(cwd, ['ls-files', '-s', '--', ...HARNESS_PATHS]));
  hash.update(git(cwd, ['diff', 'HEAD', '--', ...HARNESS_PATHS]));
  hash.update(untrackedDigest(cwd));

  return hash.digest('hex').slice(0, 16);
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
