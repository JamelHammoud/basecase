import { expect, it } from 'vitest';
import { loadFixtureRobot } from './driveChecks';
import { openApp, shown } from './harness';
import {
  REMOTE_COMPUTER,
  configureRemoteComputer,
  nameRemoteTrainingScene,
  remoteStandRow,
  remoteTrainingFixture,
  controlRemoteVerdict,
} from './remoteTrainingFixture';

it('configures two attempts, recovers one grouped workflow and shows its local verdict', async () => {
  const app = await openApp({ scenes: [], 'train-status': { uv: true, ready: true, running: [] } });

  try {
    const remote = await remoteTrainingFixture(app);
    const { page } = app;

    await controlRemoteVerdict(page);
    await configureRemoteComputer(page, 2);
    await page.keyboard.press('Escape');
    await loadFixtureRobot(page, 'quad-servo');
    await nameRemoteTrainingScene(page);
    await page.locator(shown('[role=tab]'), { hasText: 'Simulate' }).first().click();
    await remoteStandRow(page).getByRole('button', { name: 'Train', exact: true }).click();
    await expect.poll(() => remote.starts.length).toBe(1);
    await remote.emit({ kind: 'progress', message: 'Training attempts: 1/2', progress: { elapsedS: 1, budgetS: 2 } });
    await expect.poll(() => remoteStandRow(page).innerText()).toContain('Training attempts: 1/2');

    expect(remote.starts[0].recoveryKey).toBeTruthy();

    const identity = String(remote.starts[0].recoveryKey);
    const children = remote.children.get(identity);

    expect(new Set(children).size).toBe(2);
    await expect.poll(() => remote.scene()?.parts.length ?? 0).toBeGreaterThan(0);
    await remote.reload();
    await page.locator(shown('[role=tab]'), { hasText: 'Simulate' }).first().click();
    await expect.poll(() => remote.starts.length).toBe(2);
    expect(remote.starts[1].recoveryKey).toBe(identity);
    expect(remote.children.get(identity)).toEqual(children);
    await remote.emit({ kind: 'status', message: 'Connecting to training computer' });
    await expect.poll(() => remoteStandRow(page).innerText()).toContain('Connecting to training computer');

    for (const credential of [REMOTE_COMPUTER.key, REMOTE_COMPUTER.host, REMOTE_COMPUTER.hostKey])
      expect(JSON.stringify(remote.scene())).not.toContain(credential);

    await remote.complete();
    await expect.poll(() => remoteStandRow(page).innerText()).toContain('Local Arena rejected the selected attempt.');
    expect(remote.dispatched.size).toBe(1);
    expect(app.errors).toEqual([]);
  } finally {
    await app.close();
  }
});
