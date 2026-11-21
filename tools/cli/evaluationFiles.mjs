import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

export const LIMITS = Object.freeze({
  cases: 16,
  files: 512,
  parts: 512,
  seeds: 32,
  seconds: 30,
  totalSeconds: 600,
  physicsSteps: 300_000,
  policyWeights: 1_000_000,
  policyOperations: 1_000_000_000,
  fileBytes: 32 * 1024 * 1024,
  totalBytes: 128 * 1024 * 1024,
  recordings: 8,
  recordingBytes: 16 * 1024 * 1024,
  reportBytes: 1024 * 1024,
});
export const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
export const json = (value) => Buffer.from(JSON.stringify(value, null, 2) + '\n');
export const identity = (value) => digest(json(value));

export function readFile(root, relative) {
  if (
    typeof relative !== 'string' ||
    !/^[\w./-]+$/.test(relative) ||
    relative.split('/').some((p) => !p || p === '.' || p === '..')
  )
    throw new Error('Use a file inside the evaluation package.');

  let target = fs.realpathSync(root);

  for (const piece of relative.split('/')) {
    target = path.join(target, piece);

    if (fs.lstatSync(target).isSymbolicLink()) throw new Error('Use files without symbolic links.');
  }

  const stat = fs.statSync(target);

  if (!stat.isFile() || stat.size > LIMITS.fileBytes) throw new Error('Evaluation file exceeds its limits.');

  return fs.readFileSync(target);
}

export function checkedFiles(root, manifest, maxFiles = LIMITS.files) {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest) || Object.keys(manifest).length > maxFiles)
    throw new Error('Evaluation files exceed their limits.');

  const files = Object.create(null);
  let bytes = 0;

  for (const [name, hash] of Object.entries(manifest)) {
    const data = readFile(root, name);

    bytes += data.length;

    if (bytes > LIMITS.totalBytes || digest(data) !== hash) throw new Error(`Evaluation file differs: ${name}`);

    files[name] = data;
  }

  return files;
}

export function writeFiles(root, files) {
  const bytes = Object.values(files).reduce((sum, data) => sum + data.length, 0);

  if (bytes > LIMITS.totalBytes || Object.values(files).some((data) => data.length > LIMITS.fileBytes))
    throw new Error('Evaluation output exceeds its limits.');

  fs.mkdirSync(root, { recursive: false });

  for (const [name, data] of Object.entries(files)) {
    const target = path.join(root, name);

    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, data, { flag: 'wx' });
  }
}

export function runnerIdentity(root) {
  const hash = createHash('sha256');
  const walk = (dir) => {
    for (const entry of fs
      .readdirSync(path.join(root, dir), { withFileTypes: true })
      .sort((a, b) => Buffer.compare(Buffer.from(a.name), Buffer.from(b.name)))) {
      const relative = `${dir}/${entry.name}`;

      if (entry.isDirectory()) walk(relative);
      else if (!/(\.(test|perf)\.|\.md$)/.test(relative))
        hash.update(relative).update(fs.readFileSync(path.join(root, relative)));
    }
  };

  walk('src');
  walk('tools/cli');
  hash.update(fs.readFileSync(path.join(root, 'package-lock.json')));

  return hash.digest('hex');
}

function validSeeds(seeds) {
  return (
    Array.isArray(seeds) &&
    seeds.length > 0 &&
    seeds.length <= LIMITS.seeds &&
    new Set(seeds).size === seeds.length &&
    seeds.every((seed) => Number.isInteger(seed) && seed >= 0 && seed <= 0xffffffff)
  );
}

function validRandomization(value) {
  if (!value || Object.keys(value).sort().join(',') !== 'friction,latencyMs,mass,strength') return false;

  return Object.values(value).every(
    (range) =>
      Array.isArray(range) &&
      range.length === 2 &&
      range.every((n) => Number.isFinite(n) && n >= 0 && n <= 100) &&
      range[0] <= range[1],
  );
}

function withinPhysicsBudget(cases, seeds) {
  const invalid = cases.some(
    (kase) => !Number.isFinite(kase.task?.seconds) || kase.task.seconds < 0.02 || kase.task.seconds > LIMITS.seconds,
  );

  if (invalid) return false;

  const seconds = cases.reduce((sum, kase) => sum + kase.task.seconds, 0) * seeds.length * 2;
  const steps = cases.reduce((sum, kase) => sum + Math.round(kase.task.seconds / 0.02) * 10, 0) * seeds.length * 2;

  return seconds <= LIMITS.totalSeconds && steps <= LIMITS.physicsSteps;
}

function withinControllerBudget(body) {
  let operations = 0;

  for (const revision of Object.values(body.revisions)) {
    const policy = revision.controller.policy;

    if (revision.controller.kind !== 'policy') continue;

    if (!Array.isArray(policy?.layers) || !Number.isFinite(policy.controlDt) || policy.controlDt < 0.002) return false;

    const weights = policy.layers.reduce(
      (sum, layer) => sum + (Array.isArray(layer?.w) ? layer.w.length : Infinity),
      0,
    );

    if (weights > LIMITS.policyWeights) return false;

    operations +=
      body.cases.reduce((sum, kase) => sum + Math.ceil(kase.task.seconds / policy.controlDt) + 1, 0) *
      body.seeds.length *
      weights;
  }

  return operations <= LIMITS.policyOperations;
}

export function checkedDeclaration(value) {
  const { id, ...body } = value;

  if (body.format !== 'basecase-evaluation' || body.version !== 1 || identity(body) !== id)
    throw new Error('Evaluation declaration differs.');

  const { cases, seeds, conditions } = body;

  if (!validRandomization(body.randomization) || body.jointNoiseDeg !== 0 || body.fixedCase !== true)
    throw new Error('Evaluation conditions are unsupported.');

  if (
    !['baseline', 'candidate'].every((name) =>
      ['reference', 'policy'].includes(body.revisions?.[name]?.controller?.kind),
    )
  )
    throw new Error('Evaluation controller is unsupported.');

  if (!Array.isArray(cases) || !cases.length || cases.length > LIMITS.cases) throw new Error('Choose 1 to 16 Cases.');

  if (!validSeeds(seeds)) throw new Error('Choose 1 to 32 distinct unsigned seeds.');

  if (!['fixed', 'randomized'].includes(conditions)) throw new Error('Choose fixed or randomized conditions.');

  if (!withinPhysicsBudget(cases, seeds)) throw new Error('Evaluation exceeds its physics budget.');

  if (!withinControllerBudget(body)) throw new Error('Evaluation exceeds its controller budget.');

  return value;
}
