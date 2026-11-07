import { fail, pass, shCheck } from '../lib/gate.mjs';
import { prepareJob, FORGE_MANIFEST, runForge } from '../forge/run.mjs';
import { speedupAtLeast } from '../forge/tts.mjs';

const speed = {
  name: 'Full GPU loop reaches 70K steps/s at 4096 envs',
  timed: true,
  run: () => {
    const r = runForge(
      prepareJob('quad-servo', 'f5-speed', { minutes: 30, maxIterations: 10, envs: 4096, backend: 'metal' }),
    );
    const fps = r.lines.filter((l) => l.type === 'progress').at(-1)?.fps ?? 0;

    return fps >= 70000 ? pass(`${Math.round(fps)} steps/s`) : fail(`${Math.round(fps)} steps/s`);
  },
};

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
    shCheck('L4 statistics and L5 replay hold', 'cargo', [
      'test',
      '--release',
      '--manifest-path',
      FORGE_MANIFEST,
      '-p',
      'forge-train',
      'acceptance_replay',
    ]),
    speedupAtLeast(5, { backend: 'metal', envs: 4096 }),
  ],
  canaries: [
    shCheck('a policy trained on planted bad physics fails replay', 'cargo', [
      'test',
      '--release',
      '--manifest-path',
      FORGE_MANIFEST,
      '-p',
      'forge-train',
      'canary_bad_physics_replay_fails',
    ]),
  ],
};
