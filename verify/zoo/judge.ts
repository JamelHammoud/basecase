import type { MainModule } from '@mujoco/mujoco';
import { runArena } from '../../src/skills/arena';
import type { Environment } from '../../src/skills/environment';
import type { Controller } from '../../src/sim/engine';
import { offsetPose } from '../skills/judge';
import type { ZooBody } from './bodies';
import type { Hidden } from './generator';

export interface Judged {
  controller: Controller;
  observation: Environment['observation'];
  action: Environment['action'];
}

export function hiddenEnvironment(body: ZooBody, hidden: Hidden, judged: Judged): Environment {
  const pose = hidden.startOffsetDeg ? offsetPose(body.model, hidden.startOffsetDeg) : undefined;

  return {
    version: 1,
    robot: body.model.robots[0].key,
    horizonS: hidden.horizonS,
    traceDt: 0.02,
    observation: judged.observation,
    action: judged.action,
    reset: { pose, jointNoiseDeg: 1, baseYawDeg: 0, baseOffsetMm: 0 },
    randomization: { friction: [0.8, 1.2], mass: [0.9, 1.1], strength: [0.9, 1], latencyMs: [0, 20] },
    reward: { kind: 'contract-robustness' },
    contract: hidden.contract,
    signals: hidden.signals,
  };
}

export async function hiddenArenaPasses(mj: MainModule, body: ZooBody, hidden: Hidden, judged: Judged) {
  const environment = hiddenEnvironment(body, hidden, judged);
  const evidence = await runArena({
    mj,
    model: body.model,
    contract: hidden.contract,
    controller: judged.controller,
    environment,
  });

  return evidence.passed;
}
