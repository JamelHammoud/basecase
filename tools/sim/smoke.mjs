import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import loadMujoco from '@mujoco/mujoco';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');
const trainerDir = path.join(root, 'electron', 'trainer');
const npmVersion = JSON.parse(
  fs.readFileSync(path.join(root, 'node_modules', '@mujoco', 'mujoco', 'package.json'), 'utf8'),
).version;
const pyPin = /"mujoco==([^"]+)"/.exec(fs.readFileSync(path.join(trainerDir, 'pyproject.toml'), 'utf8'))?.[1];

const XML = `<mujoco>
  <compiler angle="radian" inertiafromgeom="true" boundmass="0.0005" boundinertia="1e-8"/>
  <option timestep="0.002" integrator="implicitfast"/>
  <asset><mesh name="m" vertex="-.05 -.05 0 .05 -.05 0 .05 .05 0 -.05 .05 0 0 0 .1" maxhullvert="96" inertia="convex"/></asset>
  <worldbody>
    <geom name="floor" type="plane" size="0 0 .05" contype="0" conaffinity="1"/>
    <body name="base" pos="0 0 .3"><freejoint name="root"/>
      <geom type="mesh" mesh="m" mass=".2" contype="1" conaffinity="0"/>
      <body name="arm" pos="0 0 .1">
        <joint name="hinge" type="hinge" axis="1 0 0" range="-1 1" armature=".002" damping=".01"/>
        <geom type="box" size=".01 .01 .05" pos="0 0 .05" mass=".05" contype="1" conaffinity="0"/>
      </body>
    </body>
  </worldbody>
  <actuator><position name="hinge" joint="hinge" kp="5" dampratio="1" forcerange="-1 1" ctrlrange="-1 1"/></actuator>
</mujoco>`;

const fail = (msg) => {
  console.error(`✗ ${msg}`);
  process.exit(1);
};

const mj = await loadMujoco();
const wasmVersion = mj.mj_versionString();
const m = mj.MjModel.from_xml_string(XML);
const d = new mj.MjData(m);

d.ctrl[0] = 0.5;

for (let i = 0; i < 1000; i++) mj.mj_step(m, d);

const js = [d.qpos[2], d.qpos[7]];

d.delete();
m.delete();
console.log(
  `✓ WASM MuJoCo ${wasmVersion} (npm @mujoco/mujoco ${npmVersion}): z ${js[0].toFixed(4)}, hinge ${js[1].toFixed(4)}`,
);

if (wasmVersion !== npmVersion) fail(`The WASM engine reports ${wasmVersion} but the package is ${npmVersion}.`);

if (pyPin !== npmVersion)
  fail(
    `The trainer pins mujoco==${pyPin} but the app uses ${npmVersion}. Run node tools/sim/update-mujoco.mjs ${npmVersion}.`,
  );

function checkPython() {
  const py = `
import json, mujoco, sys
m = mujoco.MjModel.from_xml_string(sys.stdin.read())
d = mujoco.MjData(m)
d.ctrl[0] = 0.5
for _ in range(1000): mujoco.mj_step(m, d)
print(json.dumps({"version": mujoco.__version__, "z": float(d.qpos[2]), "hinge": float(d.qpos[7])}))`;
  const out = execFileSync('uv', ['run', '--project', trainerDir, '--frozen', 'python', '-c', py], {
    input: XML,
    encoding: 'utf8',
    env: { ...process.env, UV_PROJECT_ENVIRONMENT: path.join(root, 'library', 'trainer-env') },
  });
  const res = JSON.parse(out.trim().split('\n').at(-1));

  console.log(`✓ Python MuJoCo ${res.version}: z ${res.z.toFixed(4)}, hinge ${res.hinge.toFixed(4)}`);

  if (res.version !== npmVersion) fail(`The trainer runs MuJoCo ${res.version}; the app runs ${npmVersion}.`);

  const drift = Math.max(Math.abs(res.z - js[0]), Math.abs(res.hinge - js[1]));

  if (drift > 1e-6) fail(`The app and the trainer disagree by ${drift}: policies may not transfer.`);

  console.log('✓ The app and the trainer simulate identically');
}

if (!process.argv.includes('--no-python')) checkPython();
