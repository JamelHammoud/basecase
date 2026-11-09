import { cargoCanary } from '../lib/canary.mjs';
import { fail, pass, shCheck } from '../lib/gate.mjs';
import { FORGE_MANIFEST, gpuProblems, prepareJob, runForge } from '../forge/run.mjs';
import { speedupAtLeast } from '../forge/tts.mjs';

const speed = {
  name: 'Full GPU loop reaches 70K steps/s at 4096 envs, and reports that it trained on the GPU',
  timed: true,
  run: () => {
    const r = runForge(
      prepareJob('quad-servo', 'f5-speed', { minutes: 30, maxIterations: 10, envs: 4096, backend: 'metal' }),
    );
    const fps = r.lines.filter((l) => l.type === 'progress').at(-1)?.fps ?? 0;
    const gpu = gpuProblems(r.lines);

    if (gpu.length) return fail(`${Math.round(fps)} steps/s, but it ${gpu[0]}`);

    return fps >= 70000 ? pass(`${Math.round(fps)} steps/s`) : fail(`${Math.round(fps)} steps/s`);
  },
};

const trainTest = (filter) => ['test', '--release', '--manifest-path', FORGE_MANIFEST, '-p', 'forge-train', filter];

export default {
  id: 's1-f5-gpu-loop',
  stage: 1,
  title: 'F5: physics, policy and learner in one GPU buffer; acceptance replay in C',
  state: 'required',
  checks: [
    shCheck('qualification vectors catch a bad GPU and fall back to C', 'cargo', [
      'test',
      '--release',
      '--manifest-path',
      FORGE_MANIFEST,
      '-p',
      'forge-sim',
      'qualification',
    ]),
    speed,
    shCheck('L4 statistics and L5 replay hold', 'cargo', trainTest('acceptance_replay')),
    speedupAtLeast(5, { backend: 'metal', envs: 4096 }, { requireGpu: true }),
  ],
  canaries: [
    cargoCanary('a policy trained on planted bad physics fails replay', trainTest('canary_bad_physics_replay_fails'), [
      /canary reached the C MuJoCo replay/,
      /C MuJoCo rejects the policy trained on planted physics/,
    ]),
    cargoCanary(
      'GPU rollouts on planted bad physics fail the L4 statistics',
      trainTest('canary_bad_physics_l4_statistics_match'),
      [/canary reached the L4 comparison/, /L4 statistics differ/],
    ),
  ],
};
