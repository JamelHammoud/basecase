import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import {
  checkedDeclaration,
  checkedFiles,
  digest,
  identity,
  json,
  LIMITS,
  readFile,
  runnerIdentity,
  writeFiles,
} from './evaluationFiles.mjs';
import { verifyRetainedEvidence } from './evaluationEvidence.mjs';
import { inspectReport, reportHtml } from './evaluationReport.mjs';

function saveReport(root, report) {
  const sealed = { ...report, id: identity(report) };

  const files = { 'comparison.json': json(sealed), 'report.html': Buffer.from(reportHtml(sealed)) };

  if (Object.values(files).reduce((sum, bytes) => sum + bytes.length, 0) > LIMITS.reportBytes)
    throw new Error('Comparison report exceeds its limits.');

  for (const [name, bytes] of Object.entries(files)) {
    fs.writeFileSync(path.join(root, `${name}.tmp`), bytes);
    fs.renameSync(path.join(root, `${name}.tmp`), path.join(root, name));
  }
}

function initialReport(declaration) {
  return {
    format: 'basecase-comparison',
    version: 1,
    evaluation: declaration.id,
    baseline: identity(declaration.revisions.baseline),
    candidate: identity(declaration.revisions.candidate),
    status: 'incomplete',
    reason: 'Execution has not finished.',
    pairs: [],
    regressions: 0,
    improvements: 0,
    changes: ['robot', 'geometry', 'joints', 'controller', 'calibration'].filter(
      (key) => identity(declaration.revisions.baseline[key]) !== identity(declaration.revisions.candidate[key]),
    ),
    files: {},
    metrics: {
      totalMs: 0,
      preparedRevisions: 2,
      seeds: 0,
      seedMs: [],
      sampledPeakRss: process.memoryUsage().rss,
      bytes: 0,
    },
  };
}

async function restoreRevision(declaration, name, context) {
  const revision = declaration.revisions[name];
  const { decodeSceneFile } = await context.load('src/utils/sceneFile.ts');
  const { provideMeshFiles } = await context.load('src/three/componentMeshes.ts');
  const { evaluationRobot } = await context.load('src/cases/evaluation.ts');
  const { evaluationComponents } = await context.load('src/cases/evaluation.ts');
  const { offlineEvaluationMesh } = await context.load('src/cases/evaluationAssets.ts');
  const scene = await decodeSceneFile(context.files[revision.scene]);
  const prepared = JSON.parse(context.files[revision.prepared]);

  if (
    digest(context.files[revision.scene]) !== revision.source ||
    identity({ parts: scene.parts, prepared }) !== revision.robot
  )
    throw new Error('Evaluation robot identity differs.');

  const prefix = revision.scene.slice(0, revision.scene.lastIndexOf('/'));
  const meshes = Object.fromEntries(
    Object.entries(context.files)
      .filter(([name]) => name.startsWith(`${prefix}/meshes/`))
      .map(([name, bytes]) => [path.basename(name, '.glb'), new Uint8Array(bytes)]),
  );

  if (evaluationComponents(scene).some((id) => !Object.hasOwn(meshes, id)))
    throw new Error('The robot mesh is missing.');

  if (Object.values(meshes).some((bytes) => !offlineEvaluationMesh(bytes)))
    throw new Error('The robot mesh can’t be read.');

  provideMeshFiles(Object.fromEntries(Object.entries(meshes).map(([id, bytes]) => [id, bytes.slice().buffer])));

  return { robot: evaluationRobot(scene, prepared), scene, meshes, controller: revision.controller };
}

export async function retainFailure(result, trial, context) {
  if (trial.passed) return;

  trial.recordingStatus = 'limit';

  if (context.retained.attempts >= LIMITS.recordings) return;

  context.retained.attempts++;

  const { evaluationRecording } = await context.load('src/cases/evaluation.ts');
  const { evaluationReplay, readEvaluationReplay } = await context.load('src/cases/evaluationReplay.ts');
  const { keepTyped } = await context.load('src/cases/recordingValues.ts');
  const id = identity({
    evaluation: context.declaration.id,
    revision: trial.revision,
    case: context.kase.id,
    seed: context.seed,
  });
  const frozen = context.revisions[context.name];
  const source = await evaluationReplay(context.mj, result, {
    scene: frozen.scene,
    meshes: frozen.meshes,
    evaluation: context.declaration.id,
    revision: trial.revision,
    seed: context.seed,
    randomization: context.declaration.randomization,
  });

  if (
    source.scene.length > 8 * 1024 * 1024 ||
    source.model.xml.length > 4 * 1024 * 1024 ||
    Object.values(source.meshes).some((bytes) => bytes.length > 8 * 1024 * 1024)
  )
    return;

  if (!readEvaluationReplay(source)) throw new Error('The runner produced corrupt evidence.');

  const recorded = { ...result, recording: { ...result.recording, evaluation: source } };
  const archive = evaluationRecording(recorded, {
    id,
    revision: trial.revision,
    seed: context.seed,
    evaluation: context.declaration.id,
  });
  const model = Buffer.from(JSON.stringify(result.model, keepTyped));

  if (context.retained.bytes + archive.length + model.length > LIMITS.recordingBytes) return;

  for (const [name, bytes] of Object.entries({ [`${id}.tries.zip`]: archive, [`${id}.model.json`]: model })) {
    fs.writeFileSync(path.join(context.output, name), bytes, { flag: 'wx' });
    context.report.files[name] = digest(bytes);
  }

  trial.recordingStatus = 'retained';
  trial.recording = `${id}.tries.zip`;
  trial.modelInput = `${id}.model.json`;
  context.retained.bytes += archive.length + model.length;
}

async function executeTrial(runner, name, context) {
  await new Promise((resolve) => setImmediate(resolve));

  if (context.stopped()) throw new Error('Execution was cancelled.');

  const start = performance.now();
  const result = await runner.run(context.seed);

  await new Promise((resolve) => setImmediate(resolve));

  if (context.stopped()) throw new Error('Execution was cancelled.');

  if (result.refusal) throw new Error(`Unsupported model: ${result.refusal}`);

  if (
    !Number.isFinite(result.margin) ||
    !result.recording ||
    [result.recording.qpos, result.recording.qvel, result.recording.ctrl, result.recording.poses].some(
      (values) => !values.every(Number.isFinite),
    )
  )
    throw new Error('The runner produced corrupt evidence.');

  const failed = result.passed ? [] : ['Missed'];
  const trial = {
    revision: context.report[name],
    model: digest(result.model.xml),
    passed: result.passed,
    margin: result.margin,
    failed: result.failed.length ? result.failed : failed,
  };

  await retainFailure(result, trial, { ...context, name });
  context.report.metrics.seedMs.push({
    revision: name,
    case: context.kase.id,
    seed: context.seed,
    ms: performance.now() - start,
  });
  context.report.metrics.sampledPeakRss = Math.max(context.report.metrics.sampledPeakRss, process.memoryUsage().rss);

  return trial;
}

async function executeCase(runners, context) {
  for (const seed of context.declaration.seeds) {
    const trialContext = { ...context, seed };
    const baseline = await executeTrial(runners.baseline, 'baseline', trialContext);
    const candidate = await executeTrial(runners.candidate, 'candidate', trialContext);
    const pair = { case: context.kase.id, seed, baseline, candidate, marginDelta: candidate.margin - baseline.margin };

    context.report.pairs.push(pair);
    context.report.regressions += Number(baseline.passed && !candidate.passed);
    context.report.improvements += Number(!baseline.passed && candidate.passed);
    context.report.metrics.seeds++;
    saveReport(context.output, context.report);
  }
}

async function executeTrials(mj, robots, context) {
  const { evaluationRunner } = await context.load('src/cases/evaluationExecution.ts');
  const { evaluationCases } = await context.load('src/cases/evaluation.ts');
  const checkpoint = async () => {
    await new Promise((resolve) => setImmediate(resolve));

    if (context.stopped()) throw new Error('Execution was cancelled.');
  };

  for (const kase of evaluationCases(context.declaration.cases)) {
    const runners = Object.fromEntries(
      Object.entries(robots).map(([name, revision]) => [
        name,
        evaluationRunner(mj, kase, revision, {
          conditions: context.declaration.conditions,
          randomization: context.declaration.randomization,
          checkpoint,
        }),
      ]),
    );

    await executeCase(runners, { ...context, kase, revisions: robots, mj });
  }
}

export async function runEvaluation(root, options, context) {
  if (!options.output) throw new Error('Choose an output folder.');

  const started = performance.now();
  const declaration = checkedDeclaration(JSON.parse(readFile(root, 'evaluation.json')));
  const files = checkedFiles(root, declaration.files);
  const report = initialReport(declaration);
  const output = path.resolve(options.output);
  const copies = Object.fromEntries(Object.entries(files).map(([name, bytes]) => [`inputs/${name}`, bytes]));

  copies['inputs/evaluation.json'] = json(declaration);

  if (
    Object.values(copies).reduce((sum, bytes) => sum + bytes.length, 0) >
    LIMITS.totalBytes - LIMITS.recordingBytes - 4 * LIMITS.reportBytes
  )
    throw new Error('Evaluation inputs exceed the output budget.');

  report.files = Object.fromEntries(Object.entries(copies).map(([name, bytes]) => [name, digest(bytes)]));
  writeFiles(output, copies);
  saveReport(output, report);

  let cancelled = false;
  const stop = () => {
    cancelled = true;
  };

  if (process.platform !== 'win32') {
    process.on('SIGINT', stop);
    process.on('SIGTERM', stop);
  }

  try {
    const { default: loadMujoco } = await import('@mujoco/mujoco');
    const mj = await loadMujoco();

    if (
      declaration.engine.mujoco !== mj.mj_versionString() ||
      declaration.engine.runner !== runnerIdentity(context.root)
    ) {
      throw new Error('Evaluation engine differs. Freeze a separate evaluation.');
    }

    const restored = { ...context, files };
    const robots = {
      baseline: await restoreRevision(declaration, 'baseline', restored),
      candidate: await restoreRevision(declaration, 'candidate', restored),
    };

    await executeTrials(mj, robots, {
      ...context,
      declaration,
      report,
      output,
      retained: { attempts: 0, bytes: 0 },
      stopped: () => cancelled || (!!options['stop-file'] && fs.existsSync(options['stop-file'])),
    });

    if (cancelled || (options['stop-file'] && fs.existsSync(options['stop-file'])))
      throw new Error('Execution was cancelled.');

    report.status = 'complete';
    report.reason = null;
  } catch (error) {
    report.reason = error.message;
    report.problem = executionProblem(error.message);
  } finally {
    if (process.platform !== 'win32') {
      process.off('SIGINT', stop);
      process.off('SIGTERM', stop);
    }

    const { evaluationPreparations } = await context.load('src/cases/evaluation.ts');

    report.metrics.geometryPreparations = evaluationPreparations();
    report.metrics.totalMs = performance.now() - started;
    report.metrics.peakRss = process.resourceUsage().maxRSS * 1024;
    report.metrics.bytes = Object.keys(report.files).reduce(
      (sum, name) => sum + fs.statSync(path.join(output, name)).size,
      0,
    );
    saveReport(output, report);
  }

  return evaluationExit(report);
}

export const evaluationExit = (report) => (report.status !== 'complete' ? 2 : Number(report.regressions > 0));

export async function inspectEvaluation(root, { load }) {
  const report = inspectReport(root);

  await verifyRetainedEvidence(root, report, load);
  console.log(JSON.stringify(report));

  return evaluationExit(report);
}

function executionProblem(message) {
  if (message.startsWith('Unsupported model:') || message.startsWith('The retained policy')) return 'unsupported';

  if (message.includes('cancelled')) return 'cancelled';

  if (message.includes('engine differs')) return 'engine';

  if (/corrupt|identity differs|schema differs/.test(message)) return 'corrupt';

  return 'execution';
}
