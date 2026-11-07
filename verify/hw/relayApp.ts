import { launchPackaged, type RunningApp } from '../../e2e/app/packagedApp';
import { daemonEvents, makeRelay, type Relay, waitFor } from './relayHarness';
import { bundledDaemon, climb, connect, DAEMON_ENV, EMULATED_ARM, mode, openOperate } from './robotApp';

export interface RelayApp {
  run: RunningApp;
  relay: Relay;
  close: () => Promise<void>;
}

export async function launchWithRelay(): Promise<RelayApp> {
  const relay = makeRelay(bundledDaemon());

  process.env[DAEMON_ENV] = relay.executable;

  const run = await launchPackaged();

  delete process.env[DAEMON_ENV];

  return {
    run,
    relay,
    close: async () => {
      await run.close();
      relay.dispose();
    },
  };
}

const modeEvent = (relay: Relay, wanted: string) => () =>
  daemonEvents(relay, 'mode').find((w) => w.msg.mode === wanted) ?? null;

export async function connectAndOpen({ run, relay }: RelayApp) {
  const reply = await connect(run.page, EMULATED_ARM);

  if (!reply.ok) throw new Error(`Connect refused: ${reply.message}`);

  await waitFor('the hello event', () => daemonEvents(relay, 'hello')[0] ?? null);
  await openOperate(run.page);
  await waitFor('Look in the Operate view', async () => (await mode(run.page).catch(() => null)) === 'look');
}

export async function climbToTest({ run, relay }: RelayApp, beforeTest: () => void = () => {}): Promise<number> {
  await climb(run.page, 'set_up');
  await waitFor('Set up', modeEvent(relay, 'set_up'));
  beforeTest();
  await climb(run.page, 'test');

  const entered = await waitFor('Test', modeEvent(relay, 'test'));

  return entered.t;
}

export const runningSince = (relay: Relay, after: number) =>
  waitFor('the robot running', () =>
    daemonEvents(relay, 'status').find((w) => w.t >= after && w.msg.run === 'running'),
  );
