import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { openApp, type App } from '../../e2e/harness';
import { driveArm, driveRover, handMismatches, stop, tap } from './driveApp';
import { armProblems, groundProblems } from './driveJudge';
import { tapState } from './workerTap';

let app: App;

beforeAll(async () => {
  app = await openApp();
  await tap(app);
}, 180000);

afterAll(async () => {
  await app?.close();
});

async function planted<T>(run: () => Promise<T>, counter: 'dropped' | 'rewritten'): Promise<T> {
  let result: T;

  try {
    result = await run();
    await stop(app);
  } catch (e) {
    throw new Error(`setup: ${(e as Error).message}`, { cause: e });
  }

  const seen = await tapState(app.page);

  await tap(app);

  if (!seen || seen[counter] === 0) throw new Error(`setup: the fault was never planted (${JSON.stringify(seen)})`);

  return result;
}

describe('Stage 2 drive canaries: faults planted in the running app', () => {
  it('canary frozen arm: an arm drive whose W and S never reach the sim passes', async () => {
    const arm = await planted(() => driveArm(app, 'arm-6dof', 'frozen-drive'), 'dropped');

    expect(armProblems(arm.phases)).toEqual([]);
  }, 240000);

  it('canary lying hand: a reported hand that moves while the rendered arm stays put passes', async () => {
    const arm = await planted(() => driveArm(app, 'arm-6dof', 'frozen-render'), 'rewritten');

    expect(handMismatches(arm.samples)).toEqual([]);
  }, 240000);

  it('canary runaway rover: a rover whose release never reaches the sim passes', async () => {
    const phases = await planted(() => driveRover(app, 'runaway'), 'rewritten');

    expect(groundProblems(phases)).toEqual([]);
  }, 240000);
});
