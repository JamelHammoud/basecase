import fs from 'node:fs';
import { performance } from 'node:perf_hooks';
import path from 'node:path';
import { isSafeFileId } from '../../electron/backend/constants.mjs';
import { checkedDeclaration, digest, identity, json, LIMITS, runnerIdentity, writeFiles } from './evaluationFiles.mjs';

function sourceBytes(file) {
  if (!file || fs.statSync(file).size > LIMITS.fileBytes) throw new Error('Choose a scene under 32 MB.');

  return fs.readFileSync(file);
}

async function freezeRevision(file, context, policyFile) {
  const { load, root } = context;
  const { decodeSceneFile } = await load('src/utils/sceneFile.ts');
  const { prepareEvaluationRobot, evaluationComponents } = await load('src/cases/evaluation.ts');
  const { evaluationController } = await load('src/cases/evaluationController.ts');
  const bytes = sourceBytes(file);
  const scene = await decodeSceneFile(bytes);

  if (scene.parts.length > LIMITS.parts) throw new Error('Evaluation robot exceeds its limits.');

  let assetBytes = bytes.length;
  const meshes = {};
  const files = {};

  for (const id of evaluationComponents(scene)) {
    if (!isSafeFileId(id)) throw new Error('The robot mesh id can’t be read.');

    const mesh = path.join(root, 'public', 'parts', `${id}.glb`);
    const data = sourceBytes(mesh);

    assetBytes += data.length;

    if (assetBytes > LIMITS.totalBytes / 2) throw new Error('Evaluation files exceed their limits.');

    meshes[id] = new Uint8Array(data).buffer;
    files[`meshes/${id}.glb`] = data;
  }

  const prepared = await prepareEvaluationRobot(scene, meshes);
  const revision = {
    scene: 'scene.basecase',
    prepared: 'geometry.json',
    robot: identity({ parts: scene.parts, prepared }),
    geometry: identity(prepared.triangles),
    joints: identity(prepared.joints),
    controller: evaluationController(
      !policyFile || policyFile === 'reference' ? undefined : JSON.parse(sourceBytes(policyFile)),
    ),
    calibration: identity({
      servo: scene.project?.servoCalibrations,
      units: scene.project?.unitCalibrations,
      body: scene.project?.bodyCalibrations,
    }),
    source: digest(bytes),
  };

  files['scene.basecase'] = bytes;
  files['geometry.json'] = json(prepared);

  return { scene, revision, files };
}

export async function freezeEvaluation(file, options, context) {
  if (!options.candidate || !options.package) throw new Error('Choose a candidate scene and evaluation package.');

  if (options.randomization && !['nominal', 'case'].includes(options.randomization))
    throw new Error('Choose nominal or Case randomization.');

  const started = performance.now();
  const { evaluationPreparations } = await context.load('src/cases/evaluation.ts');
  const preparationStart = evaluationPreparations();
  const baseline = await freezeRevision(file, context, options.policy);
  const candidate = await freezeRevision(options.candidate, context, options['candidate-policy'] ?? options.policy);
  const { sceneCases } = await context.load('src/cases/sceneCheck.ts');
  const { evaluationCases } = await context.load('src/cases/evaluation.ts');
  const select = (scene) => sceneCases(scene).filter((kase) => !options.case || kase.id === options.case);
  const cases = evaluationCases(select(baseline.scene));

  if (identity(cases) !== identity(evaluationCases(select(candidate.scene))))
    throw new Error('Case declarations differ. Freeze a separate evaluation.');

  const files = {};
  const revisions = {};

  for (const [name, frozen] of Object.entries({ baseline, candidate })) {
    for (const [relative, bytes] of Object.entries(frozen.files)) files[`${name}/${relative}`] = bytes;

    revisions[name] = { ...frozen.revision, scene: `${name}/scene.basecase`, prepared: `${name}/geometry.json` };
  }

  const { default: loadMujoco } = await import('@mujoco/mujoco');
  const mj = await loadMujoco();
  const { CASE_RANDOMIZATION } = await context.load('src/cases/caseRandom.ts');
  const body = {
    format: 'basecase-evaluation',
    version: 1,
    cases,
    seeds: (options.seeds ?? '1').split(',').map((seed) => (/^\d+$/.test(seed) ? Number(seed) : NaN)),
    conditions: options.conditions ?? 'randomized',
    randomization:
      options.randomization === 'nominal'
        ? { friction: [1, 1], mass: [1, 1], strength: [1, 1], latencyMs: [0, 0] }
        : CASE_RANDOMIZATION,
    jointNoiseDeg: 0,
    fixedCase: true,
    engine: { mujoco: mj.mj_versionString(), runner: runnerIdentity(context.root) },
    revisions,
    files: Object.fromEntries(Object.entries(files).map(([name, bytes]) => [name, digest(bytes)])),
  };
  const declaration = checkedDeclaration({ ...body, id: identity(body) });

  files['evaluation.json'] = json(declaration);
  writeFiles(path.resolve(options.package), files);

  if (options.json)
    console.log(
      JSON.stringify({
        preparationMs: performance.now() - started,
        geometryPreparations: evaluationPreparations() - preparationStart,
        peakRss: process.resourceUsage().maxRSS * 1024,
      }),
    );

  return 0;
}
