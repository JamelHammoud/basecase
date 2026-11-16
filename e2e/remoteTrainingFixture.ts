import { expect } from 'vitest';
import type { Page } from 'playwright-core';
import type { TrainStartPayload } from '../src/utils/platform/types';
import type { SavedSceneRecord } from '../src/types/robotics';
import { shown, type App } from './harness';
import type { TrainingComputerStatus } from '../src/remoteTraining/bridge';

export const REMOTE_COMPUTER = {
  host: 'trainer.local',
  user: 'robot',
  key: '/keys/training identity',
  hostKey: 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIE5nR94khA4laX50C1CbAgBhQNuRAkSLX9ASnWZvT2EW',
};

const JOB_ID = 'policy-remote-fixture';

interface EventsWindow {
  remoteTrainingEvent: (event: Record<string, unknown>) => void;
}

async function installEvents(page: Page) {
  const install = () => {
    const sources = new Set<{ onmessage: ((event: MessageEvent) => void) | null }>();

    Object.assign(window, {
      EventSource: class {
        onmessage: ((event: MessageEvent) => void) | null = null;
        constructor() {
          sources.add(this);
        }
        close() {
          sources.delete(this);
        }
      },
      remoteTrainingEvent: (event: Record<string, unknown>) => {
        for (const source of sources) source.onmessage?.(new MessageEvent('message', { data: JSON.stringify(event) }));
      },
    });
  };

  await page.evaluate(install);
  await page.addInitScript(install);
}

export const remoteStandRow = (page: Page) =>
  page.locator(shown('[data-testid="skill-row"]'), { hasText: 'Stand' }).first();

export async function configureRemoteComputer(page: Page) {
  await page.keyboard.press('Meta+k');
  await page.getByLabel('Search commands').fill('Training Settings');
  await page.keyboard.press('Enter');

  for (const [label, value] of [
    ['Host', REMOTE_COMPUTER.host],
    ['User', REMOTE_COMPUTER.user],
    ['SSH identity', REMOTE_COMPUTER.key],
    ['Host key', REMOTE_COMPUTER.hostKey],
  ])
    await page.getByLabel(label, { exact: true }).fill(value);

  await page
    .getByRole('tablist', { name: 'Attempts', exact: true })
    .getByRole('tab', { name: '1', exact: true })
    .click();
  await page
    .getByRole('tablist', { name: 'Concurrent attempts', exact: true })
    .getByRole('tab', { name: '2', exact: true })
    .click();

  await page.getByRole('button', { name: 'Connect', exact: true }).click();
  await expect.poll(() => page.getByRole('button', { name: 'Use This Computer', exact: true }).count()).toBe(1);
  expect(await page.getByLabel('SSH identity', { exact: true }).inputValue()).toBe('');
}

export async function remoteTrainingFixture(app: App) {
  const { page } = app;
  const starts: TrainStartPayload[] = [];
  const dispatched = new Set<string>();
  let computer: TrainingComputerStatus = { selected: false };
  let scene: SavedSceneRecord | null = null;
  const state = () => ({ ...REMOTE_COMPUTER, key: undefined, keySaved: true, selected: true });

  await installEvents(page);
  await page.route('**/api/bridge/remote-training-*', async (route) => {
    const name = new URL(route.request().url()).pathname.split('/').pop();

    if (name === 'remote-training-configure') {
      const config = route.request().postDataJSON().arg;

      expect(config).toMatchObject(REMOTE_COMPUTER);
      computer = { ...state(), attempts: config.attempts, concurrency: config.concurrency };
    }

    if (name === 'remote-training-clear') computer = { selected: false };

    await route.fulfill({ json: computer });
  });
  await page.route('**/api/bridge/train-start', async (route) => {
    const payload = route.request().postDataJSON() as TrainStartPayload;

    starts.push(payload);
    dispatched.add(String(payload.recoveryKey));

    await route.fulfill({ json: { jobId: JOB_ID } });
  });
  await page.route('**/api/bridge/save-scene', async (route) => {
    scene = route.request().postDataJSON() as SavedSceneRecord;
    await route.fulfill({ json: { ...scene, partCount: scene.parts.length } });
  });
  await page.route('**/api/bridge/scenes', (route) =>
    route.fulfill({ json: scene ? [{ ...scene, partCount: scene.parts.length }] : [] }),
  );
  await page.route(
    (url) => url.pathname === '/api/bridge/scene',
    (route) => route.fulfill({ json: scene }),
  );

  const emit = (event: Record<string, unknown>) =>
    page.evaluate((payload) => (window as unknown as EventsWindow).remoteTrainingEvent(payload), {
      type: 'train-progress',
      jobId: JOB_ID,
      workspaceId: starts.at(-1)?.workspaceId,
      ...event,
    });
  const reload = async () => {
    await page.reload();
    await page.waitForFunction(() => Boolean((window as unknown as { __studio?: unknown }).__studio));
  };

  return {
    starts,
    dispatched,
    scene: () => scene,
    reload,
    emit,
  };
}
