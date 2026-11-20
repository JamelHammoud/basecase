import { convertLocalFacility } from '../electron/simready/localFacility.mjs';
import { afterAll, beforeAll, expect, inject, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { fleetFixture, type FleetClient } from '../tools/fleet/fixture.mjs';
import { factoryDxf, siteControls, usdFacility } from '../src/fleet/sites/siteFixtures';
import type { Browser, Page } from 'playwright-core';
import { launchChrome } from './harness';

let browser: Browser;
let page: Page;
let fixture: Awaited<ReturnType<typeof fleetFixture>>;
let admin: FleetClient;
let site: string;
let robots: string[];

beforeAll(async () => {
  await convertLocalFacility([{ name: 'fixture.usda', base64: Buffer.from(usdFacility()).toString('base64') }]);
  fixture = await fleetFixture({
    assets: async (_request, response, url) => {
      const result = await fetch(`${inject('webUrl')}${url.pathname}${url.search}`);

      response.writeHead(result.status, { 'Content-Type': result.headers.get('content-type') ?? 'text/plain' });
      response.end(Buffer.from(await result.arrayBuffer()));
    },
  });
  admin = await fixture.bootstrap('Facilities');
  site = (await admin.create('site', { name: 'Factory' })).id;
  robots = await Promise.all(
    ['Rover 01', 'Rover 02'].map(async (name) => (await admin.create('robot', { name, parent: site })).id),
  );
  browser = await launchChrome();
  page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(`${fixture.origin}/fleet`);
  await page.getByRole('textbox', { name: 'Organization ID' }).fill(admin.org);
  await page.getByRole('textbox', { name: 'Email' }).fill(admin.email);
  await page.getByLabel('Password', { exact: true }).fill('fleet-fixture-password');
  await page.getByRole('button', { name: 'Sign In', exact: true }).click();
  await page.getByLabel('Site', { exact: true }).selectOption(site);
});

afterAll(async () => {
  try {
    await browser?.close();
  } finally {
    await fixture?.close();
  }
});

it('uploads, registers and reopens a facility from a replay-fed robot on the globe', async () => {
  await page.getByLabel('Source units', { exact: true }).selectOption('mm');
  await uploadFacility({ name: 'factory.dxf', mimeType: 'application/dxf', buffer: Buffer.from(factoryDxf) });
  await expect.poll(() => page.getByTestId('fleet-facility').count()).toBe(1);

  for (const [point, control] of siteControls.controls.entries()) {
    const values = [...control.local, control.latitude, control.longitude, control.altitudeM];
    const labels = ['Local east (m)', 'Local north (m)', 'Local up (m)', 'Latitude', 'Longitude', 'Altitude (m)'];

    for (const [index, label] of labels.entries())
      await page.getByLabel(`${label} ${point + 1}`, { exact: true }).fill(String(values[index]));
  }

  await page.getByLabel('Vertical frame', { exact: true }).selectOption('ellipsoid');
  await page.getByRole('button', { name: 'Register Site', exact: true }).click();
  await expect
    .poll(
      async () => (await admin.result<{ registration: unknown }>('GET', `site/${site}/facility`)).registration != null,
    )
    .toBe(true);

  const saved = await admin.result<{ facility: { hash: string }; registration: { matrix: number[] } }>(
    'GET',
    `site/${site}/facility`,
  );

  for (const [index, robot] of robots.entries()) {
    await admin.publish([
      {
        robot,
        generation: await admin.generation(robot),
        event: randomUUID(),
        observedAt: new Date().toISOString(),
        status: 'online',
        pose: {
          frame: 'facility',
          site,
          facility: saved.facility.hash,
          pointM: [index * 8, 0, 0],
          quality: 'reported',
          floor: 'Ground',
        },
        work: { current: 'Inspect line', next: 'Return to dock' },
      },
    ]);
  }

  await page.getByLabel('Site', { exact: true }).selectOption('');
  await expect
    .poll(() => page.getByTestId('fleet-globe').getByRole('button', { name: 'Rover 01', exact: true }).count())
    .toBe(1);
  await page.getByTestId('fleet-globe').getByRole('button', { name: 'Rover 01', exact: true }).click();
  await page.getByRole('button', { name: 'Open Facility', exact: true }).click();
  await expect.poll(() => page.getByTestId('fleet-facility').count()).toBe(1);
  await page.reload();
  await page.getByLabel('Site', { exact: true }).selectOption(site);
  await expect.poll(() => page.getByTestId('fleet-facility').count()).toBe(1);

  const reopened = await admin.result<{ registration: { matrix: number[] } }>('GET', `site/${site}/facility`);

  expect(reopened.registration.matrix).toEqual(saved.registration.matrix);
  expect(await page.getByText('Register this facility to place robots on the globe').count()).toBe(0);
});

it('imports a locally uploaded USD facility through the production converter', async () => {
  await uploadFacility({ name: 'facility.usda', mimeType: 'text/plain', buffer: Buffer.from(usdFacility()) });
  await expect
    .poll(
      async () => (await admin.result<{ facility: { name: string } }>('GET', `site/${site}/facility`)).facility.name,
    )
    .toBe('facility.usda');
  await expect.poll(() => page.getByTestId('fleet-facility').count()).toBe(1);

  const saved = await admin.result<{
    facility: { sourceFrame: { metersPerUnit: number; up: string }; sources: { name: string }[] };
    registration: unknown;
  }>('GET', `site/${site}/facility`);

  expect(saved.facility.sourceFrame.metersPerUnit).toBeCloseTo(0.01);
  expect(saved.facility.sourceFrame.up).toBe('Y');
  expect(saved.facility.sources[0].name).toBe('facility.usda');
  expect(saved.registration).toBeNull();
  await expect.poll(() => page.getByLabel('Latitude 1', { exact: true }).inputValue()).toBe('');
});

async function uploadFacility(file: { name: string; mimeType: string; buffer: Buffer }) {
  const chooser = page.waitForEvent('filechooser');

  await page.getByRole('button', { name: 'Upload Facility', exact: true }).click();
  await (await chooser).setFiles(file);
}

it('clears entered controls when replacing a facility with identical source bytes', async () => {
  const source = { name: 'factory.dxf', mimeType: 'application/dxf', buffer: Buffer.from(factoryDxf) };

  await page.getByLabel('Source units', { exact: true }).selectOption('mm');
  await uploadFacility(source);
  await expect.poll(() => page.getByText('factory.dxf', { exact: true }).count()).toBe(1);
  await expect.poll(() => page.getByRole('button', { name: 'Upload Facility', exact: true }).isEnabled()).toBe(true);
  await expect.poll(() => page.getByTestId('fleet-facility').count()).toBe(1);
  await page.getByLabel('Latitude 1', { exact: true }).fill('42');
  await uploadFacility(source);
  await expect.poll(() => page.getByLabel('Latitude 1', { exact: true }).inputValue()).toBe('');
  expect(await page.getByTestId('fleet-facility').count()).toBe(1);
});
