import loadMujoco, { type MainModule } from '@mujoco/mujoco';
import { beforeAll, describe, expect, it } from 'vitest';
import { applyBodyFit } from './bodyModel';
import { bodyFixture, loadedSlidingContact, recordedBodyRun, slidingBodyFixture } from './bodyFit.fixtures';
import { fitBody } from './fitBody';

let mj: MainModule;

beforeAll(async () => {
  mj = await loadMujoco();
});

describe('body identification from recorded intents', () => {
  it('recovers a 150 g wrist payload and a 1.3 times forearm, improves held-out motion and repeats exactly', async () => {
    const { model, robot, forearm, wrist } = bodyFixture();
    const planted = { massScales: { [forearm]: 1.3 }, payloadKg: { [wrist]: 0.15 }, floorFrictionScale: 1 };
    const run = recordedBodyRun(mj, applyBodyFit(model, robot, planted));
    const request = { model, robot, run, mj };
    const fitted = await fitBody(request);

    expect(fitted.verdict, JSON.stringify(fitted)).toBe('measured');
    expect(fitted.fit.payloadKg[wrist]).toBeCloseTo(0.15, 1);
    expect(Math.abs(fitted.fit.payloadKg[wrist] / 0.15 - 1)).toBeLessThanOrEqual(0.2);
    expect(Math.abs(fitted.fit.massScales[forearm] / 1.3 - 1)).toBeLessThanOrEqual(0.15);
    expect(fitted.evidence.gain).toBeGreaterThanOrEqual(0.25);
    expect(fitted.evidence.units).toBe('rad');
    expect(await fitBody(request)).toEqual(fitted);
  });

  it('refuses shuffled measurements and recordings without motion or valid times', async () => {
    const { model, robot } = bodyFixture();
    const run = recordedBodyRun(mj, model);
    const shuffled = {
      ...run,
      statuses: run.statuses.map((s, i) => ({
        ...s,
        positions: run.statuses[(i * 37) % run.statuses.length].positions,
      })),
    };

    expect((await fitBody({ model, robot, run: shuffled, mj })).verdict).toBe('cant-tell');
    expect((await fitBody({ model, robot, run: { ...run, intents: [] }, mj })).verdict).toBe('cant-tell');
    expect(
      (await fitBody({ model, robot, run: { ...run, statuses: run.statuses.map((s) => ({ ...s, at: 0 })) }, mj }))
        .verdict,
    ).toBe('cant-tell');
  });

  it('recovers floor friction from a legged robot with sliding contacts', async () => {
    const { model, robot } = slidingBodyFixture();
    let slidingFrames = 0;
    let tilt = 0;
    const planted = { massScales: {}, payloadKg: {}, floorFrictionScale: 0.55 };
    const run = recordedBodyRun(mj, applyBodyFit(model, robot, planted), true, (engine) => {
      if (loadedSlidingContact(mj, engine)) slidingFrames++;

      tilt = Math.max(tilt, Math.hypot(engine.data.qpos[4], engine.data.qpos[5]));
    });
    const fitted = await fitBody({ model, robot, run, mj });

    expect(model.robots[0]).toMatchObject({ floating: true, morphology: 'legged' });
    expect(slidingFrames).toBeGreaterThan(20);
    expect(tilt).toBeLessThan(0.01);
    expect(fitted.verdict, JSON.stringify(fitted)).toBe('measured');
    expect(Math.abs(fitted.fit.floorFrictionScale / 0.55 - 1)).toBeLessThanOrEqual(0.2);
    expect(fitted.evidence.gain).toBeGreaterThanOrEqual(0.25);
    expect(fitted.evidence.units).toBe('m');
  });
});
