import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs';
import type { RobotFleet } from '../electron/robot/robotFleet.mjs';
import type { App } from './harness';
import type { networkRobotEvents } from './networkRobotEvents';

export type NetworkRobotFixture = {
  directory?: string;
  daemon?: ChildProcessWithoutNullStreams;
  app?: App;
  fleet?: RobotFleet;
  forwarding?: ReturnType<typeof networkRobotEvents>;
};

async function stopDaemon(daemon?: ChildProcessWithoutNullStreams) {
  if (!daemon || daemon.exitCode !== null || daemon.signalCode !== null) return;

  const exited = once(daemon, 'exit');

  daemon.kill();
  await exited;
}

export async function closeNetworkRobotFixture(fixture: NetworkRobotFixture) {
  const errors: unknown[] = [];
  const releases = [
    () => fixture.forwarding?.close(),
    () => fixture.fleet?.dispose(),
    () => stopDaemon(fixture.daemon),
    () => fixture.app?.close(),
    () => {
      if (fixture.directory) fs.rmSync(fixture.directory, { recursive: true, force: true });
    },
  ];

  for (const release of releases) {
    try {
      await release();
    } catch (error) {
      errors.push(error);
    }
  }

  if (errors.length) throw new AggregateError(errors, 'Network robot fixture cleanup failed');
}
