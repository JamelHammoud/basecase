import { analysisArmScene } from '../src/reality/bodyAnalysisMatrix.fixtures';
import { parkedBodyRun } from '../src/reality/bodyMotion.fixtures';
import type { SimModel } from '../src/sim/mjcfTypes';
import type { RobotRun } from '../src/robot/runBuffer';
import { openApp, openPlayTab } from './harness';

export interface BodyMotionStudio {
  load: (record: unknown) => void;
  attachRobot: (link: unknown) => void;
  bodyModel: () => Promise<SimModel>;
  seedBodyEvidence: (input: { run: RobotRun; model: SimModel; id: string }) => Promise<void>;
  bodyCalibrations: () => unknown;
  bodyChecks: () => Promise<unknown>;
  sceneRecord: () => { parts: unknown[]; project: Record<string, unknown> };
  bodyAnalysisMetrics: () => { motion: unknown; runtime: unknown };
}

export async function openBodyMotionApp() {
  const app = await openApp();

  await app.page.evaluate(() => {
    const target = window as unknown as { __studio: BodyMotionStudio; __bodyMotionCommands: number };

    target.__bodyMotionCommands = 0;
    target.__studio.attachRobot({
      onRobotEvent: () => () => undefined,
      robotUnits: async () => [],
      robotCommand: async () => {
        target.__bodyMotionCommands++;

        return { ok: true };
      },
    });
  });
  await app.page.evaluate((scene) => (window as unknown as { __studio: BodyMotionStudio }).__studio.load(scene), {
    ...analysisArmScene(),
    id: 'body-motion-scene',
  });
  await openPlayTab(app.page, 'Operate');

  const model = await app.page.evaluate(() =>
    (window as unknown as { __studio: BodyMotionStudio }).__studio.bodyModel(),
  );
  const run = parkedBodyRun(model);

  await app.page.evaluate(
    async ({ model, run }) => {
      const studio = (window as unknown as { __studio: BodyMotionStudio }).__studio;

      await studio.seedBodyEvidence({ model, run, id: 'body-motion-arm' });
    },
    { model, run },
  );

  return { app };
}
