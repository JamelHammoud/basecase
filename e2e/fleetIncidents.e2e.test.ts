import { expect, it } from 'vitest';
import { encodeRecording } from '../src/cases/recordingFile';
import { storedTry } from '../src/cases/trySearch/fixtures/searchFixtures';
import { FleetIncidents } from '../src/robot/fleetIncidents';
import { ARM } from './armFixture';
import { openApp, openPlayTab, partCount, shown } from './harness';

function keptFault() {
  const manifest = {
    ...storedTry({ id: 'fleet-fault-try', source: 'operate', caseName: null, seconds: 0.02 }),
    robot: { name: 'arm-3', modelHash: 'a'.repeat(64), joints: ARM.project.joints.map((joint) => joint.id) },
    frames: 2,
  };
  const recording = encodeRecording({
    dt: 0.02,
    frames: 2,
    nq: 3,
    nv: 3,
    nu: 3,
    nbody: 0,
    t: new Float32Array([0, 0.02]),
    ctrl: new Float32Array(6),
    qpos: new Float64Array([0, 0, 0, 0.1, 0.2, 0.3]),
    qvel: new Float32Array(6),
    poses: new Float32Array(),
    jointQpos: new Int32Array([0, 1, 2]),
    jointDof: new Int32Array([0, 1, 2]),
  });
  const incidents = new FleetIncidents();

  incidents.event(
    {
      event: 'fault',
      unit: 'arm-3',
      code: 'stall',
      id: 2,
      message: 'Shoulder stalled',
      context: { session: manifest.id, sceneId: manifest.sceneId, modelHash: manifest.robot.modelHash },
    },
    1000,
  );
  incidents.event({ event: 'recorded', unit: 'arm-3', id: manifest.id, manifest }, 1001);

  return { manifest, recording: Buffer.from(recording).toString('base64'), incidents: incidents.items };
}

it('restores a fleet problem, acknowledges it and opens its exact kept try', async () => {
  const app = await openApp();
  const { page } = app;
  const fixture = keptFault();

  try {
    await page.evaluate(async ({ manifest, recording, incidents }) => {
      localStorage.setItem('robot-fleet-incidents-v1', JSON.stringify(incidents));
      await fetch('/api/bridge/tries-save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ arg: { manifest, recording } }),
      });
    }, fixture);
    await page.reload();
    await page.waitForFunction(() => !!(window as unknown as { __studio?: unknown }).__studio);
    await page.evaluate(
      (scene) => (window as unknown as { __studio: { load: (scene: unknown) => void } }).__studio.load(scene),
      ARM,
    );
    await expect.poll(() => partCount(page)).toBe(ARM.parts.length);
    await openPlayTab(page, 'Operate');
    await page
      .locator(shown('[data-fleet-unit="arm-3"]'))
      .getByRole('button', { name: 'Inspect Problems', exact: true })
      .click();

    const dialog = page.getByRole('dialog').filter({ has: page.locator('[data-incident]') });
    const incident = dialog.locator('[data-incident]');

    expect(await incident.getAttribute('data-active')).toBe('true');
    await dialog.getByRole('button', { name: 'Acknowledge', exact: true }).click();
    expect(await incident.getAttribute('data-active')).toBe('true');
    expect(await incident.innerText()).toContain('Acknowledged');
    await dialog.getByRole('button', { name: 'Open Try', exact: true }).click();
    await expect.poll(() => page.locator(shown('[data-testid="try-timeline"]')).count()).toBe(1);
    expect(app.posts.filter((post) => post.route === 'tries-recording').map((post) => post.body)).toContainEqual({
      arg: fixture.manifest.id,
    });
    await page.keyboard.press('Escape');
    await expect.poll(() => page.locator(shown('[data-testid="try-timeline"]')).count()).toBe(0);
    expect(app.errors).toEqual([]);
  } finally {
    await app.close();
  }
});
