import { afterAll, describe, expect, it } from 'vitest';
import { climbToTest, connectAndOpen, launchWithRelay, type RelayApp } from './relayApp';
import { heartbeatProblems } from './robotChecks';

const WINDOW_MS = 3000;

let app: RelayApp | undefined;

afterAll(async () => {
  await app?.close();
});

describe('canary: an app that skips the heartbeat', () => {
  it('claims the heartbeat held while nothing reached the daemon, and must not', async () => {
    app = await launchWithRelay().catch(() => undefined);

    if (!app) return;

    const ready = await connectAndOpen(app)
      .then(() => true)
      .catch(() => false);

    if (!ready) return;

    const relay = app.relay;
    const entered = await climbToTest(app, () => relay.starve(true)).catch(() => null);

    if (entered === null) return;

    await new Promise((resolve) => setTimeout(resolve, WINDOW_MS + 500));

    const window = { from: entered, until: entered + WINDOW_MS };

    expect(heartbeatProblems(relay.sent(), relay.received(), window)).toEqual([]);
  });
});
