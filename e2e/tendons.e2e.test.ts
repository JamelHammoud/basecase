import { afterAll, beforeAll, expect, it } from 'vitest';
import { openApp, shown, type App } from './harness';
import { command, sceneJoints } from './passiveJointSteps';
import { tendonMechanism } from '../src/sim/fixtures/tendonMechanisms';
import { decodeRecording } from '../src/cases/recordingFile';
import { remoteElbowCase } from '../src/sim/fixtures/tendonCase';
import type { Recording } from '../src/sim/recorder';

let app: App;

interface Studio {
  load: (scene: unknown) => void;
  simState: () => { playing: boolean; joints: Record<string, { position: number }>; tries: Array<{ id: string }> };
  recordSimulation: (on: boolean) => Promise<number[] | null>;
  replaySimulation: (bytes: number[], frame: number) => Promise<number>;
  addCase: (raw: unknown) => string;
  tendonRecording: (
    id: string,
  ) => Promise<{ nu: number; nq: number; transmission: Recording['transmission']; opened: Recording['transmission'] }>;
}

beforeAll(async () => {
  app = await openApp();
});

afterAll(async () => {
  await app?.close();
});

async function openElbow() {
  const { input } = tendonMechanism();
  const project = { ...input.project, joints: input.project.joints.map((j) => ({ ...j, tendon: undefined })) };

  await app.page.evaluate((scene) => (window as unknown as { __studio: Studio }).__studio.load(scene), {
    name: 'Remote elbow',
    parts: input.parts,
    project,
  });
  await command(app, 'Show Pose');
  await app.page.locator(shown('[data-joint="motor_0"]')).first().click({ button: 'right' });
  await app.page.getByRole('menuitem', { name: 'Edit Tendon', exact: true }).click();
}

it('authors and edits a remote elbow tendon in Pose, simulates it and reopens separate recorded channels', async () => {
  await openElbow();
  await app.page.getByRole('textbox', { name: 'Spool coefficient', exact: true }).fill('-10');
  await app.page.getByRole('textbox', { name: 'Output 1 coefficient', exact: true }).fill('10');
  await app.page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect
    .poll(async () => (await sceneJoints(app)).find((j) => j.id === 'motor_0')?.tendon?.terms[0].coefficient)
    .toBe(10);
  await command(app, 'Edit Tendon');
  await app.page.getByRole('textbox', { name: 'Output 1 coefficient', exact: true }).fill('20');
  await app.page.getByRole('button', { name: 'Save', exact: true }).click();
  await app.page.locator(shown('[data-joint="motor_0"]')).first().getByRole('textbox').fill('30');
  await app.page.keyboard.press('Enter');
  await command(app, 'Simulate');
  await expect
    .poll(() => app.page.evaluate(() => (window as unknown as { __studio: Studio }).__studio.simState().playing))
    .toBe(true);
  await app.page.evaluate(() => (window as unknown as { __studio: Studio }).__studio.recordSimulation(true));
  await expect
    .poll(() =>
      app.page.evaluate(
        () => (window as unknown as { __studio: Studio }).__studio.simState().joints.output_0?.position ?? 0,
      ),
    )
    .toBeGreaterThan(5);
  await expect
    .poll(() =>
      app.page.evaluate(
        () => (window as unknown as { __studio: Studio }).__studio.simState().joints.motor_0?.position ?? 0,
      ),
    )
    .toBeGreaterThan(10);

  const bytes = await app.page.evaluate(() =>
    (window as unknown as { __studio: Studio }).__studio.recordSimulation(false),
  );

  expect(bytes).not.toBeNull();
  await command(app, 'Stop Simulation');
  await command(app, 'Simulate');
  await expect
    .poll(() => app.page.evaluate(() => (window as unknown as { __studio: Studio }).__studio.simState().playing))
    .toBe(true);

  const frame = await app.page.evaluate(
    (saved) => (window as unknown as { __studio: Studio }).__studio.replaySimulation(saved, -1),
    bytes!,
  );

  const recording = decodeRecording(Uint8Array.from(bytes!))!;

  expect(frame).toBe(recording.frames - 1);
  expect(recording.nu).toBe(1);
  expect(recording.nq).toBe(2);
  expect(recording.transmission!.motors[0].tendon.terms[0].coefficient).toBe(20);
  expect((await sceneJoints(app)).find((j) => j.id === 'motor_0')?.tendon?.terms[0].coefficient).toBe(20);

  await app.page.evaluate(
    (kase) => (window as unknown as { __studio: Studio }).__studio.addCase(kase),
    remoteElbowCase,
  );
  await app.page.getByRole('button', { name: 'Try Reference', exact: true }).click();
  await expect
    .poll(() => app.page.evaluate(() => (window as unknown as { __studio: Studio }).__studio.simState().tries.length))
    .toBe(1);
  await app.page.getByTestId('try-row').first().click();
  await app.page.getByTestId('try-timeline').waitFor();

  const saved = await app.page.evaluate(async () => {
    const studio = (window as unknown as { __studio: Studio }).__studio;

    return studio.tendonRecording(studio.simState().tries[0].id);
  });

  expect(saved.nu).toBe(1);
  expect(saved.nq).toBe(2);
  expect(saved.transmission).toEqual(saved.opened);
  expect(saved.transmission!.motors[0].tendon.terms[0].coefficient).toBe(20);
  expect(saved.transmission!.motors[0].actuator).toBe(0);
  expect(saved.transmission!.observations.map((joint) => joint.joint).sort()).toEqual(['motor_0', 'output_0']);
  expect(new Set(saved.transmission!.observations.map((joint) => joint.qpos)).size).toBe(2);
});

it('refuses a singular declaration without changing the scene and supports undo and redo', async () => {
  await openElbow();
  await app.page.getByRole('textbox', { name: 'Output 1 coefficient', exact: true }).fill('0');
  await app.page.getByRole('button', { name: 'Save', exact: true }).click();
  await app.page.getByRole('alert').waitFor();
  expect((await sceneJoints(app)).find((j) => j.id === 'motor_0')?.tendon).toBeUndefined();
  await app.page.getByRole('textbox', { name: 'Output 1 coefficient', exact: true }).fill('10');
  await app.page.getByRole('button', { name: 'Save', exact: true }).click();
  await app.page.keyboard.press('ControlOrMeta+z');
  await expect.poll(async () => (await sceneJoints(app)).find((j) => j.id === 'motor_0')?.tendon).toBeUndefined();
  await app.page.keyboard.press('ControlOrMeta+Shift+z');
  await expect
    .poll(async () => (await sceneJoints(app)).find((j) => j.id === 'motor_0')?.tendon?.terms[0].coefficient)
    .toBe(10);
});
