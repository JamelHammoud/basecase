import type { MainModule } from '@mujoco/mujoco';
import { SimEngine } from '../engine';
import { captureContactReplay } from './contactReplay';
import { closedLinkage, closedLinkages } from './closedLinkages';

export function closedReplays(mj: MainModule) {
  return closedLinkages.map((spec) => {
    const { model, builds } = closedLinkage(spec);
    const capture = captureContactReplay(mj);
    const engine = new SimEngine(capture.module, model);

    try {
      for (let i = 0; i < 25; i++) {
        engine.setController({ kind: 'hold', values: Object.fromEntries(builds.map((b) => [b.crankJoint, i / 2])) });
        engine.step(0.02);
      }

      return capture.finish(`closed-${spec.name}`, model);
    } finally {
      engine.dispose();
    }
  });
}
