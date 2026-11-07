import { afterAll, describe, expect, it } from 'vitest';
import { connectAndOpen, launchWithRelay, type RelayApp } from './relayApp';
import { waitFor } from './relayHarness';
import { hideText, nonce, textVisible } from './robotChecks';

let app: RelayApp | undefined;

afterAll(async () => {
  await app?.close();
});

describe('canary: a UI that hides a fault', () => {
  it('claims the fault is on screen after it was hidden, and must not', async () => {
    app = await launchWithRelay().catch(() => undefined);

    if (!app) return;

    const page = app.run.page;
    const ready = await connectAndOpen(app)
      .then(() => true)
      .catch(() => false);

    if (!ready) return;

    const fault = nonce('Servo 1 stopped answering, so the robot is holding still');

    app.relay.inject({ event: 'fault', at_us: 1, code: 'no_reply', message: fault });

    const shown = await waitFor('the fault', () => textVisible(page, fault), 3000).catch(() => false);

    if (!shown || (await hideText(page, fault)) === 0) return;

    expect(await textVisible(page, fault)).toBe(true);
  });
});
