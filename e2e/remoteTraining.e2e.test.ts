import { expect, it } from 'vitest';
import { loadFixtureRobot } from './driveChecks';
import { openApp, shown } from './harness';
import {
  REMOTE_COMPUTER,
  configureRemoteComputer,
  nameRemoteTrainingScene,
  remoteStandRow,
  remoteTrainingFixture,
} from './remoteTrainingFixture';

it('configures a training computer and reattaches Stand after a studio restart without a second dispatch', async () => {
  const app = await openApp({ scenes: [], 'train-status': { uv: true, ready: true, running: [] } });

  try {
    const remote = await remoteTrainingFixture(app);
    const { page } = app;

    await loadFixtureRobot(page, 'quad-servo');
    await configureRemoteComputer(page);
    await page.keyboard.press('Escape');
    await nameRemoteTrainingScene(page);
    await page.locator(shown('[role=tab]'), { hasText: 'Simulate' }).first().click();
    await remoteStandRow(page).getByRole('button', { name: 'Train', exact: true }).click();
    await expect.poll(() => remote.starts.length).toBe(1);
    await remote.emit({ kind: 'progress', progress: { elapsedS: 15, budgetS: 120 } });
    await expect.poll(() => remoteStandRow(page).innerText()).toContain('Training');
    await expect.poll(() => remote.scene()?.parts.length ?? 0).toBeGreaterThan(0);
    expect(remote.scene()?.name).toBe('Remote quadruped');
    expect(remote.starts[0].recoveryKey).toBeTruthy();

    await remote.reload();
    await page.locator(shown('[role=tab]'), { hasText: 'Simulate' }).first().click();
    await expect.poll(() => remote.starts.length).toBe(2);
    expect(remote.starts[1].recoveryKey).toBe(remote.starts[0].recoveryKey);
    expect(remote.dispatched.size).toBe(1);
    await remote.emit({ kind: 'status', message: 'Connecting to training computer' });
    await expect.poll(() => remoteStandRow(page).innerText()).toContain('Connecting to training computer');

    for (const credential of [REMOTE_COMPUTER.key, REMOTE_COMPUTER.host, REMOTE_COMPUTER.hostKey])
      expect(JSON.stringify(remote.scene())).not.toContain(credential);

    expect(remote.dispatched.size).toBe(1);
    expect(app.errors).toEqual([]);
  } finally {
    await app.close();
  }
});
