import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { expect, inject, it } from 'vitest';
import { strFromU8, unzipSync } from 'three/examples/jsm/libs/fflate.module.js';
import { electricalScenes } from '../src/wiring/electricalFixtures';
import { openApp, shown } from './harness';
import { buildCheckPage } from './buildCheckFixtures';
import { openKitScene } from './kitScene';

it.each(['desktop', 'web'])(
  'exports the current connector references and fingerprint through Build on %s and updates electrical findings after a supply edit',
  async (surface) => {
    const app = await openApp();

    try {
      const scene = electricalScenes().find((entry) => entry.name === 'gripper')!.scene;

      const record = { ...scene, name: 'Schematic gripper' };

      await openKitScene(app.page, record, surface === 'web' ? inject('webUrl') : undefined);
      await app.page.locator(shown('[role=tab]'), { hasText: 'Build' }).first().click();

      const check = buildCheckPage(() => app.page);
      const electrical = check.checkRow('Electrical connections');
      const voltage = check.checkRow('Servo voltage');

      await expect.poll(() => electrical.getAttribute('data-status')).toBe('fail');
      await check.expand(electrical, 'Electrical connections');
      expect(await electrical.innerText()).not.toContain('declared supply voltage differs');
      await check.expand(voltage, 'Servo voltage');
      await voltage.getByRole('textbox', { name: 'Supply voltage' }).fill('12');
      await voltage.getByRole('textbox', { name: 'Supply voltage' }).press('Enter');
      await expect.poll(() => electrical.innerText()).toContain('declared supply voltage differs');
      await app.page.getByRole('button', { name: 'Export', exact: true }).click();

      const delivery = app.page.waitForEvent('download');

      await app.page.getByRole('menuitem', { name: 'Schematic', exact: true }).click();

      const download = await delivery;
      const files = unzipSync(await readFile((await download.path())!));
      const text = (path: string) => strFromU8(files[`robot/${path}`]);
      const report = JSON.parse(text('requirements.json'));

      expect(download.suggestedFilename()).toBe('schematic-gripper-schematic.zip');
      expect(report.sourceFingerprint).toBe(createHash('sha256').update(text('source.json')).digest('hex'));
      expect(report.projection.powerBudget.sourceNominalV).toBe(12);
      expect(report.projection.electricalVerdict).toBe('not-established');
      expect(
        report.projection.endpoints.find(
          (end: { partId: string; port: string }) => end.partId === 'servo1' && end.port === 'bus-in',
        ),
      ).toMatchObject({ componentId: 'feetech-sts3215', variant: 'c001', reference: 'J3' });
      expect(text('robot.kicad_sch')).toContain('INCOMPLETE DRAFT');
      expect(text('robot.kicad_sym')).toContain('Interface_J3');
      expect(text('sym-lib-table')).toContain('${KIPRJMOD}/robot.kicad_sym');
      expect(app.errors).toEqual([]);
    } finally {
      await app.close();
    }
  },
);
