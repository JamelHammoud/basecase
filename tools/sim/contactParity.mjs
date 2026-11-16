import assert from 'node:assert/strict';
import { replayDifferences } from './contactReplayComparison.mjs';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import loadMujoco from '@mujoco/mujoco';
import { createServer } from 'vite';
import { findOnPath } from '../../electron/executables.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const version = JSON.parse(
  fs.readFileSync(path.join(root, 'node_modules/@mujoco/mujoco/package.json'), 'utf8'),
).version;
const pin = /"mujoco-core==([^"]+)"/.exec(
  fs.readFileSync(path.join(root, 'electron/trainer/pyproject.toml'), 'utf8'),
)?.[1];

async function loadModules(files) {
  const server = await createServer({
    root,
    configFile: false,
    logLevel: 'silent',
    appType: 'custom',
    server: { middlewareMode: true, hmr: false, watch: null },
    optimizeDeps: { noDiscovery: true },
  });

  try {
    return await Promise.all(files.map((file) => server.ssrLoadModule(file)));
  } finally {
    await server.close();
  }
}

async function fixtures(mj) {
  const [{ contactScene, contactSliders }, { captureContactReplay }] = await loadModules([
    '/src/sim/fixtures/contactRobots.ts',
    '/src/sim/fixtures/contactReplay.ts',
  ]);
  const built = contactSliders(2);
  const sim = {
    ...built,
    xml: built.xml.replaceAll('<position ', '<position delay="0.006" nsample="5" interp="linear" '),
  };
  const capture = captureContactReplay(mj);
  const model = mj.MjModel.from_xml_string(sim.xml);
  const data = new mj.MjData(model);

  data.ctrl.set([0.01, -0.01]);
  primeHistory(mj, model, data);
  mj.mj_forward(model, data);

  for (let i = 0; i < 100; i++) capture.module.mj_step(model, data);

  data.delete();
  model.delete();

  const cases = [1, 2, 31, 33].flatMap((count) => [
    { name: `contacts-${count}`, xml: contactScene(count).xml },
    { name: `sliders-${count}`, xml: contactSliders(count).xml, steps: 10 },
  ]);

  return [...cases, capture.finish('captured-sliders', sim)];
}

function primeHistory(mj, model, data) {
  for (let actuator = 0; actuator < model.nu; actuator++) {
    const samples = model.actuator_history[actuator * 2];

    if (model.actuator_historyadr[actuator] < 0 || !samples) continue;

    const times = Array.from({ length: samples }, (_, k) => data.time - (samples - k) * model.opt.timestep);

    mj.mj_initCtrlHistory(model, data, actuator, times, new Array(samples).fill(data.ctrl[actuator]));
  }
}

function contactNames(mj, model, data) {
  const list = data.contact;

  try {
    return Array.from({ length: data.ncon }, (_, i) => {
      const contact = list.get(i);

      const names = [contact.geom1, contact.geom2]
        .map((g) => mj.mj_id2name(model, mj.mjtObj.mjOBJ_GEOM.value, g))
        .sort();

      contact.delete();

      return names;
    }).sort((a, b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1]));
  } finally {
    list.delete();
  }
}

function wasmSample(mj, model, snapshot, steps) {
  const data = new mj.MjData(model);

  try {
    for (const field of ['qpos', 'qvel', 'ctrl']) {
      if (snapshot[field]) data[field].set(snapshot[field]);
    }

    data.time = snapshot.time ?? 0;
    primeHistory(mj, model, data);
    mj.mj_forward(model, data);

    const contacts = contactNames(mj, model, data);

    for (let i = 0; i < steps; i++) mj.mj_step(model, data);

    return { contacts, qpos: Array.from(data.qpos), qvel: Array.from(data.qvel) };
  } finally {
    data.delete();
  }
}

function compareSnapshots(mj, given, expected) {
  const model = mj.MjModel.from_xml_string(given.xml);
  const snapshots = given.snapshots ?? [{ ctrl: given.ctrl ?? new Array(model.nu).fill(0) }];
  let drift = 0;

  try {
    snapshots.forEach((snapshot, index) => {
      const actual = wasmSample(mj, model, snapshot, given.steps ?? 0);
      const native = expected[index];

      assert.deepEqual(actual.contacts, native.contacts, `${given.name} snapshot ${index} contacts`);

      for (const field of ['qpos', 'qvel']) {
        assert.equal(actual[field].length, native[field].length);
        drift = actual[field].reduce((worst, value, i) => Math.max(worst, Math.abs(value - native[field][i])), drift);
      }
    });
    assert.ok(drift < 1e-8, `${given.name} state drift ${drift}`);
    console.log(`${given.name}: ${snapshots.length} snapshots, contacts match, state drift ${drift}`);
  } finally {
    model.delete();
  }
}

function compareReplay(given, native) {
  const { drift, contactDifferences } = replayDifferences(given, native);

  console.log(
    `${given.name}: ${given.controls.length} substeps, ${native.length} samples, ${contactDifferences} contact differences, state drift ${drift}`,
  );
  assert.ok(drift < 1e-6, `${given.name} state drift ${drift}`);
  assert.equal(contactDifferences, 0, `${given.name} active body contacts differ`);
}

function argumentsOf(args) {
  const files = [];
  let output = null;
  let handoff = false;
  let passive = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--passive') {
      passive = true;

      continue;
    }

    if (args[i] === '--handoff') {
      handoff = true;

      continue;
    }

    if (args[i] !== '--out') {
      files.push(args[i]);

      continue;
    }

    output = args[++i];
    assert.ok(output, 'Name an output file after --out');
  }

  return { files, output, handoff, passive };
}

assert.equal(pin, version, 'C and WASM package pins differ');

const uv = findOnPath('uv');

assert.ok(uv, 'Install uv to run C MuJoCo parity');

const { files, output, handoff, passive } = argumentsOf(process.argv.slice(2));
const mj = await loadMujoco();
const cases = [...(await fixtures(mj)), ...files.flatMap((file) => JSON.parse(fs.readFileSync(file, 'utf8')))];

if (handoff) {
  const [{ handoffContactReplays }] = await loadModules(['/src/sim/fixtures/handoffContactReplay.ts']);

  cases.push(...(await handoffContactReplays(mj)));
}

if (passive) {
  const [{ passiveContactReplays }] = await loadModules(['/src/sim/fixtures/passiveContactReplay.ts']);

  cases.push(...(await passiveContactReplays(mj)));
}

const native = JSON.parse(
  execFileSync(
    uv,
    [
      'run',
      '--no-project',
      '--with',
      `mujoco-core==${pin}`,
      'python',
      path.join(root, 'tools/sim/contactReference.py'),
    ],
    {
      input: JSON.stringify(cases),
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    },
  ),
);

assert.equal(native.version, mj.mj_versionString());

if (output) fs.writeFileSync(output, JSON.stringify(native));

cases.forEach((given, index) => {
  if (given.controls) {
    compareReplay(given, native.cases[index]);

    return;
  }

  compareSnapshots(mj, given, native.cases[index]);
});

async function scoreNativeCases() {
  if (!cases.some((given) => given.kase)) return [];

  const [{ scoreTry }, { buildRig }, { contactReplayRecording }] = await loadModules([
    '/src/cases/tries.ts',
    '/src/utils/kinematics.ts',
    '/src/sim/fixtures/contactReplayRecording.ts',
  ]);
  const verdicts = [];

  for (let index = 0; index < cases.length; index++) {
    const given = cases[index];

    if (!given.kase) continue;

    const scoring = {
      kase: given.kase,
      model: given.model,
      effector: given.effector,
      effectors: given.effectors,
      rig: buildRig(given.joints, given.parts),
    };
    const baseline = await scoreTry({
      ...scoring,
      recording: contactReplayRecording(given, given.expected, given.model),
    });
    const replayed = await scoreTry({
      ...scoring,
      recording: contactReplayRecording(given, native.cases[index], given.model),
    });

    assert.equal(baseline.passed, given.wasmPassed, `${given.name} recorded WASM verdict`);
    assert.equal(replayed.passed, baseline.passed, `${given.name} native verdict`);
    assert.ok(Math.abs(replayed.margin - baseline.margin) < 1e-6, `${given.name} native margin`);
    verdicts.push({
      name: given.name,
      wasmPassed: baseline.passed,
      nativePassed: replayed.passed,
      wasmMargin: baseline.margin,
      nativeMargin: replayed.margin,
    });
    console.log(
      `${given.name}: WASM ${baseline.passed}, C ${replayed.passed}, margin drift ${Math.abs(replayed.margin - baseline.margin)}`,
    );
  }

  return verdicts;
}

native.verdicts = await scoreNativeCases();

if (output) fs.writeFileSync(output, JSON.stringify(native));
