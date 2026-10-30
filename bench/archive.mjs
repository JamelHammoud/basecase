import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

export const INDEX_FILE = 'index.jsonl';

export function gitInfo(cwd) {
  try {
    const commit = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd, encoding: 'utf8' }).trim();
    const dirty = execFileSync('git', ['status', '--porcelain'], { cwd, encoding: 'utf8' }).trim().length > 0;

    return { commit, dirty };
  } catch {
    return { commit: null, dirty: null };
  }
}

const pick = (obj, keys) => Object.fromEntries(keys.filter((k) => obj?.[k] !== undefined).map((k) => [k, obj[k]]));

const orNull = (...values) => values.find((v) => v !== undefined && v !== null) ?? null;

function judgeFields(judge) {
  return {
    judge: orNull(judge?.score),
    judgeCostUsd: orNull(judge?.costUsd),
    critique: orNull(judge?.issues),
  };
}

export function indexEntry({ run, task, kind, summary, git, at = new Date() }) {
  const m = summary.metrics ?? {};

  return {
    at: at.toISOString(),
    run,
    task,
    kind,
    ...git,
    seconds: orNull(m.seconds, summary.seconds),
    costUsd: orNull(m.costUsd),
    tokens: orNull(m.tokens),
    toolCalls: orNull(m.toolCalls, summary.toolCalls),
    failedTools: orNull(m.failedTools, summary.failedTools),
    score: orNull(summary.score?.total),
    drawingIoU: orNull(summary.drawing?.iou),
    ...judgeFields(summary.judge),
    ...pick(summary, ['grade', 'seed', 'heldOut']),
  };
}

export function appendIndex(runsDir, entry) {
  fs.mkdirSync(runsDir, { recursive: true });
  fs.appendFileSync(path.join(runsDir, INDEX_FILE), JSON.stringify(entry) + '\n');
}

export function readIndex(runsDir) {
  const file = path.join(runsDir, INDEX_FILE);

  if (!fs.existsSync(file)) return [];

  const latest = new Map();

  for (const line of fs.readFileSync(file, 'utf8').split('\n').filter(Boolean)) {
    try {
      const e = JSON.parse(line);

      latest.set(`${e.run}\u0000${e.task}\u0000${e.seed ?? ''}`, e);
    } catch {}
  }

  return [...latest.values()];
}

export function archiveRun({ runsDir, run, task, kind, dir, summary, scene, git }) {
  if (scene) fs.writeFileSync(path.join(dir, 'scene.json'), JSON.stringify(scene));

  fs.writeFileSync(path.join(dir, 'summary.json'), JSON.stringify(summary, null, 1));

  const entry = indexEntry({ run, task, kind, summary, git });

  appendIndex(runsDir, entry);

  return entry;
}
