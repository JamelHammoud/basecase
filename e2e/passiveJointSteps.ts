import { expect } from 'vitest';
import { passiveMechanism, passiveMechanisms } from '../src/sim/fixtures/passiveMechanisms';
import type { RobotJoint } from '../src/types/robotics';
import { shown, type App } from './harness';

interface Studio {
  load: (record: unknown) => void;
  select: (ids: string[]) => void;
  sceneRecord: () => { project: { joints: RobotJoint[] } };
  simState: () => { joints: Record<string, { position: number }>; playing: boolean };
  robotPackage: () => Promise<{ simXml: string }>;
}

export const passiveRecord = () => {
  const { parts, project } = passiveMechanism(passiveMechanisms[0]);

  return {
    name: 'Finger',
    parts,
    project: {
      ...project,
      joints: project.joints.map((j) => ({ ...j, name: 'Finger', actuation: 'powered' as const })),
    },
  };
};

export const sceneJoints = (app: App) =>
  app.page.evaluate(() => (window as unknown as { __studio: Studio }).__studio.sceneRecord().project.joints);

export async function command(app: App, label: string) {
  await app.page.keyboard.press('Meta+k');
  await app.page.keyboard.type(label);
  await app.page.keyboard.press('Enter');
}

export async function openFinger(app: App) {
  await app.page.evaluate(
    (record) => (window as unknown as { __studio: Studio }).__studio.load(record),
    passiveRecord(),
  );
  await app.page.evaluate(() => (window as unknown as { __studio: Studio }).__studio.select(['link_0']));
  await command(app, 'Show Pose');
  await app.page.locator(shown('[data-joint="joint_0"]')).first().click();
}

export async function openActuation(app: App) {
  await app.page.locator(shown('[data-joint="joint_0"]')).first().click({ button: 'right' });
  await app.page.getByRole('menuitem', { name: 'Actuation', exact: true }).hover();
  await app.page.getByRole('menuitem', { name: 'Passive', exact: true }).waitFor();
}

export async function makePassive(app: App) {
  await openActuation(app);
  await app.page.getByRole('menuitem', { name: 'Passive', exact: true }).click();
  await expect.poll(async () => (await sceneJoints(app))[0].actuation).toBe('passive');
}

export async function fall(app: App) {
  await command(app, 'Simulate');
  await expect
    .poll(async () =>
      app.page.evaluate(
        () => (window as unknown as { __studio: Studio }).__studio.simState().joints.joint_0?.position ?? 0,
      ),
    )
    .toBeLessThan(-20);

  const xml = await app.page.evaluate(
    async () => (await (window as unknown as { __studio: Studio }).__studio.robotPackage()).simXml,
  );

  expect(xml.match(/<(position|velocity|motor) /g) ?? []).toHaveLength(0);
}
