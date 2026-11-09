import { expect } from 'vitest';
import { partCount, type App } from '../../e2e/harness';
import { DEFAULT_PROJECT } from '../../src/types/robotics';
import { DRIVE_BARS, type ArmPhases, type V3 } from './driveJudge';
import { playRobot } from './play';
import { handSpec, installTap, renderedFrame, renderedHand, tapState, type Fault, type HandSpec } from './workerTap';

interface PlayState {
  drive: string;
  driveClass: string | null;
  stats: { time: number; robots: Array<{ forward: number; fellAt: number | null }> } | null;
}

type Studio = { simState: () => PlayState; load: (r: unknown) => void };

const visible = (selector: string) => `${selector}:not([inert] *):visible`;

export const state = (app: App) =>
  app.page.evaluate(() => (window as unknown as { __studio: Studio }).__studio.simState());

export const forward = async (app: App) => (await state(app)).stats?.robots[0]?.forward ?? 0;

export const fell = async (app: App) => ((await state(app)).stats?.robots[0]?.fellAt ?? null) !== null;

export const wait = (app: App, ms: number) => app.page.waitForTimeout(ms);

export const tap = (app: App, fault: Fault = 'none') => app.page.evaluate(installTap, fault);

export async function drive(app: App, id: string) {
  const robot = playRobot(id);

  await app.page.evaluate((record) => (window as unknown as { __studio: Studio }).__studio.load(record), {
    name: id,
    parts: robot.parts,
    project: { ...DEFAULT_PROJECT, joints: robot.joints },
  });
  await expect.poll(() => partCount(app.page)).toBe(robot.parts.length);
  await app.page.locator(visible('[role=tab]'), { hasText: 'Simulate' }).first().click();
  await app.page
    .locator(visible('button'), { hasText: /^Drive$/ })
    .first()
    .click();
  await expect.poll(async () => (await state(app)).drive, { timeout: 60000 }).toBe('on');
  await app.page.mouse.click(720, 450);
}

export async function hold(app: App, key: string, ms: number) {
  await app.page.mouse.click(720, 450);
  await app.page.keyboard.down(key);
  await app.page.waitForTimeout(ms);
  await app.page.keyboard.up(key);
}

export async function stop(app: App) {
  await app.page.keyboard.press('Escape');
  await expect.poll(async () => (await state(app)).drive).toBe('off');
}

export interface HandSample {
  rendered: V3;
  reported: V3;
}

export async function handSample(app: App, spec: HandSpec): Promise<HandSample> {
  const frame = await renderedFrame(app.page);

  if (!frame) throw new Error(`setup: no sim frame reached the page (${JSON.stringify(await tapState(app.page))})`);

  if (!frame.effector)
    throw new Error('simState().effector is missing: an arm drive must report its hand in mm, world frame');

  return { rendered: renderedHand(frame, spec), reported: frame.effector };
}

export function handMismatches(samples: HandSample[]): string[] {
  return samples.flatMap(({ rendered, reported }, i) => {
    const off = Math.hypot(rendered[0] - reported[0], rendered[1] - reported[1], rendered[2] - reported[2]);

    return off > DRIVE_BARS.handMatchMm
      ? [`sample ${i}: the reported hand is ${off.toFixed(1)} mm from the rendered one`]
      : [];
  });
}

export interface ArmDrive {
  phases: ArmPhases;
  samples: HandSample[];
}

export async function driveArm(app: App, id: string, fault: Fault = 'none'): Promise<ArmDrive> {
  const spec = handSpec(playRobot(id));

  await drive(app, id);
  await tap(app, fault);
  await wait(app, 200);

  const start = await handSample(app, spec);

  await wait(app, 1000);

  const afterIdle = await handSample(app, spec);

  await hold(app, 'w', 1500);

  const afterForward = await handSample(app, spec);

  await hold(app, 's', 1500);

  const afterBack = await handSample(app, spec);

  await wait(app, 1000);

  const afterRelease = await handSample(app, spec);
  const samples = [start, afterIdle, afterForward, afterBack, afterRelease];
  const [s, i, f, b, r] = samples.map((x) => x.rendered);

  return {
    phases: { start: s, afterIdle: i, afterForward: f, afterBack: b, afterRelease: r, fell: await fell(app) },
    samples,
  };
}

export async function driveRover(app: App, fault: Fault = 'none') {
  await drive(app, 'rover-diff');
  await tap(app, fault);

  const start = await forward(app);

  await wait(app, 1000);

  const afterIdle = await forward(app);

  await hold(app, 'w', 2500);

  const afterForward = await forward(app);

  await hold(app, 's', 2500);

  const afterBack = await forward(app);

  await wait(app, 1000);

  return { start, afterIdle, afterForward, afterBack, afterRelease: await forward(app), fell: await fell(app) };
}
