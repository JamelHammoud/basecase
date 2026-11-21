import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { RobotFleet } from '../../electron/robot/robotFleet.mjs';
import { fakeNetworkRobot, TEST_KEY } from '../../electron/robot/networkFake.mjs';

export async function attachLoopback(publisher) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'basecase-fleet-studio-'));
  const peer = await fakeNetworkRobot();
  let closed;
  const disconnected = new Promise((resolve) => {
    closed = resolve;
  });
  const fleet = new RobotFleet({
    binary: '',
    publisher,
    tmpDir: directory,
    networkStoreDir: path.join(directory, 'pairings'),
    pairRobot: () => ({ key: Promise.resolve(TEST_KEY), cancel() {} }),
    emit(event) {
      if (event.event === 'link' && event.state === 'closed') closed();
    },
  });
  const reply = await fleet.connectNetwork({ ...peer.endpoint, code: '123456' }, 'robot');

  if (!reply.ok) throw new Error('Loopback studio connection failed');

  await Promise.all([...publisher.active.values()]);

  return {
    fleet,
    async disconnect() {
      fleet.disconnect('robot');
      await disconnected;
      await Promise.all([...publisher.active.values()]);
    },
    async close() {
      fleet.dispose();
      await Promise.allSettled([...publisher.active.values()]);
      await peer.close();
      await rm(directory, { recursive: true, force: true });
    },
  };
}
