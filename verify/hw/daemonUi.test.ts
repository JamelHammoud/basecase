import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { climbToTest, connectAndOpen, launchWithRelay, type RelayApp, runningSince } from './relayApp';
import { daemonEvents, waitFor } from './relayHarness';
import { heartbeatProblems, ladderProblems, nonce, textVisible } from './robotChecks';

const RUN_WINDOW_MS = 6000;
const STALE_CODES = new Set(['client_lost', 'intent_stale']);

let app: RelayApp;

const page = () => app.run.page;

const shownSoon = (text: string, ms = 3000) => waitFor(`"${text}" on screen`, () => textVisible(page(), text), ms);

async function jointShowsStatus(id: number) {
  const joint = page().locator(`[data-robot-joint="${id}"]:visible`).first();
  const shown = Number(await joint.getAttribute('data-position', { timeout: 1000 }));
  const recent = daemonEvents(app.relay, 'status')
    .slice(-30)
    .flatMap((w) => (w.msg.joints as Array<{ id: number; position: number | null }>) ?? [])
    .filter((j) => j.id === id)
    .map((j) => j.position);

  return recent.includes(shown);
}

beforeAll(async () => {
  app = await launchWithRelay();
}, 240000);

afterAll(async () => {
  await app?.close();
});

describe('the robot daemon inside the app', () => {
  it('starts the daemon emulated, hears its hello and shows its status', async () => {
    await connectAndOpen(app);

    const argv = app.relay.argv() ?? [];
    const hello = daemonEvents(app.relay, 'hello')[0]?.msg;

    expect(argv).toContain('--emulated');
    expect(argv).not.toContain('--port');
    expect(argv.join(' ')).toMatch(/--family feetech --ids 1,2|--ids 1,2 .*--family feetech/);
    expect(hello?.emulated).toBe(true);
    expect(hello?.real_transport).toBe(false);
    expect(typeof hello?.lost_message).toBe('string');
    await waitFor('joint 1 to show its status', () => jointShowsStatus(1).catch(() => false));
    await waitFor('joint 2 to show its status', () => jointShowsStatus(2).catch(() => false));
  });

  it('climbs only through enter, one rung at a time, and keeps the heartbeat while motors run', async () => {
    const skip = page().locator('[data-robot-rung="test"]:visible');

    expect((await skip.count()) === 0 || (await skip.first().isDisabled())).toBe(true);

    const entered = await climbToTest(app);
    const running = await runningSince(app.relay, entered);

    await new Promise((resolve) => setTimeout(resolve, RUN_WINDOW_MS + 500));

    const window = { from: running.t, until: running.t + RUN_WINDOW_MS };

    expect(heartbeatProblems(app.relay.sent(), app.relay.received(), window)).toEqual([]);
    expect(ladderProblems(app.relay.sent(), app.relay.received())).toEqual([]);
    expect(await page().locator('[data-testid="robot-mode"]:visible').first().getAttribute('data-mode')).toBe('test');
  });

  it('a starved heartbeat stops the robot, and the UI says so in the daemon’s words', async () => {
    const starvedAt = app.relay.entries().at(-1)?.t ?? 0;

    app.relay.starve(true);

    const fault = await waitFor(
      'the daemon to stop the robot',
      () => daemonEvents(app.relay, 'fault').find((w) => w.t >= starvedAt && STALE_CODES.has(String(w.msg.code))),
      2000,
    );

    expect(fault.t - starvedAt).toBeLessThan(400);
    expect(await shownSoon(String(fault.msg.message))).toBe(true);
    app.relay.starve(false);
  });

  it('shows every refusal and fault the daemon sends', async () => {
    const refused = nonce('Set up needs every servo to answer first');
    const fault = nonce('Servo 2 reached 51 °C, so it was switched off to cool down');

    app.relay.inject({ event: 'refused', message: refused });
    expect(await shownSoon(refused)).toBe(true);
    app.relay.inject({ event: 'fault', at_us: 1, code: 'overheat', message: fault });
    expect(await shownSoon(fault)).toBe(true);
  });

  it('a killed daemon is shown as lost, in plain words', async () => {
    const hello = daemonEvents(app.relay, 'hello')[0]?.msg;
    const pid = app.relay.daemonPid();

    if (!pid) throw new Error('The relay never started a daemon');

    process.kill(pid, 'SIGKILL');
    await waitFor('the relay to see the daemon die', () => app.relay.entries().some((e) => e.exit !== undefined));
    expect(await shownSoon(String(hello?.lost_message))).toBe(true);
  });

  it('ran without page errors', () => {
    expect(app.run.errors).toEqual([]);
  });
});
