import fs from 'node:fs';
import path from 'node:path';
import { createEventHandler } from '../run-events.mjs';
import { answerText, appTimeouts, readEvents, runMetrics } from '../metrics.mjs';
import { archiveRun } from '../archive.mjs';
import { mainServedModel, servedModels } from '../compare/models.mjs';
import { gradeTask } from './grade.mjs';
import { loadFixtureInApp } from './materialize.mjs';
import { appModule, readJson } from './scenes.mjs';
import { startSceneFile } from './tasks/index.mjs';

async function startScene(slot, task) {
  if (task.record) return loadFixtureInApp({ slot, fixture: null, record: await task.record(appModule) });

  const file = startSceneFile(task);

  return loadFixtureInApp({ slot, fixture: file ? null : task.fixture(), record: file ? readJson(file) : null });
}

async function promptAgent({ slot, task, dir, model, effort }) {
  const logFile = fs.createWriteStream(path.join(dir, 'events.jsonl'));
  const t0 = Date.now();

  slot.onEvent.current = createEventHandler({
    counts: { toolCalls: 0, modelPart: 0, failedTools: 0, thoughtChunks: 0, messageChunks: 0 },
    log: () => {},
    logFile,
    started: t0,
  });

  const result = await slot.post('/api/bridge/acp-prompt', { promptText: task.instruction, model, effort });
  const seconds = Math.round((Date.now() - t0) / 1000);

  await new Promise((r) => setTimeout(r, 1500));
  slot.onEvent.current = null;
  await new Promise((r) => logFile.end(r));

  return { result, seconds };
}

export function modelFields(result, { model, effort }) {
  return {
    model: model ?? null,
    effort: effort ?? null,
    sessionModel: result?.model ?? null,
    sessionEffort: result?.effort ?? null,
    servedBy: mainServedModel(result?.modelUsage),
    served: servedModels(result?.modelUsage),
  };
}

export async function runMicroOnce({ slot, task, seed, out, model, effort, harness }) {
  const dir = path.join(out.dir, task.id, `seed-${seed}`);

  fs.mkdirSync(dir, { recursive: true });
  await slot.post('/api/bridge/acp-new-conversation');

  const before = await startScene(slot, task);

  fs.writeFileSync(path.join(dir, 'start.json'), JSON.stringify(before));

  const { result, seconds } = await promptAgent({ slot, task, dir, model, effort });
  const records = readEvents(path.join(dir, 'events.jsonl'));
  const answer = answerText(records);
  const after = await slot.api('sceneRecord');
  const unreachable = appTimeouts(records);
  const grade = unreachable
    ? {
        status: 'error',
        checks: [],
        detail: `${unreachable} tool calls couldn't reach the app, so the run says nothing about the model.`,
      }
    : await gradeTask(task, { before, after, answer, app: { call: slot.call } });
  const summary = {
    task: task.id,
    seed,
    heldOut: !!task.heldOut,
    grade: grade.status,
    harness: harness ?? null,
    ...modelFields(result, { model, effort }),
    metrics: runMetrics(records, { result, seconds }),
  };

  fs.writeFileSync(path.join(dir, 'answer.md'), answer);
  fs.writeFileSync(path.join(dir, 'grade.json'), JSON.stringify(grade, null, 1));
  archiveRun({
    runsDir: out.runsDir,
    run: out.runName,
    task: task.id,
    kind: 'micro',
    dir,
    summary,
    scene: after,
    git: out.git,
  });

  return {
    task: task.id,
    category: task.category,
    heldOut: !!task.heldOut,
    seed,
    status: grade.status,
    grade,
    costUsd: summary.metrics.costUsd,
    tokens: summary.metrics.tokens,
    seconds,
    servedBy: summary.servedBy,
  };
}
