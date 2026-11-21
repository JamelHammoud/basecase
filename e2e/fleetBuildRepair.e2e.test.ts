import fs from 'node:fs/promises';
import { afterAll, beforeAll, expect, inject, it } from 'vitest';
import { fleetFixture } from '../tools/fleet/fixture.mjs';
import { buildEvidenceFragment } from '../src/fleet/buildReference';
import { launchChrome } from './harness';

let fixture: Awaited<ReturnType<typeof fleetFixture>>;

beforeAll(async () => {
  fixture = await fleetFixture({
    assets: async (_request, response, url) => {
      const result = await fetch(`${inject('webUrl')}${url.pathname}${url.search}`);

      response.writeHead(result.status, { 'Content-Type': result.headers.get('content-type') ?? 'text/plain' });
      response.end(Buffer.from(await result.arrayBuffer()));
    },
  });
});

afterAll(async () => fixture?.close());

it(
  'links one existing Fleet robot through inventory, refuses a viewer and sends no robot commands',
  { retry: 0 },
  async () => {
    const admin = await fixture.bootstrap('BuildRepair');
    const site = await admin.create('site', { name: 'Workshop' });
    const robot = await admin.create('robot', {
      name: 'Arm one',
      parent: site.id,
      attributes: { controller: 'retained' },
    });
    const role = await admin.create('role', {
      name: 'Viewer',
      rules: [{ effect: 'allow', scope: site.id, actions: ['inventory.view'], conditions: {} }],
    });
    const viewer = await admin.enroll('build-viewer@example.test', [role.id]);
    const evidence = {
      build: crypto.randomUUID(),
      repair: crypto.randomUUID(),
      source: 'a'.repeat(64),
      target: 'b'.repeat(64),
    };
    const browser = await launchChrome();
    const requests: Array<{ url: string; method: string }> = [];

    try {
      const page = await browser.newPage();

      page.on('request', (request) => requests.push({ url: request.url(), method: request.method() }));
      await page.goto(`${fixture.origin}/fleet#${buildEvidenceFragment(evidence)}`);
      await page.getByRole('textbox', { name: 'Organization ID' }).fill(admin.org);
      await page.getByRole('textbox', { name: 'Email' }).fill(admin.email);
      await page.getByLabel('Password', { exact: true }).fill('fleet-fixture-password');
      await page.getByRole('button', { name: 'Sign In', exact: true }).click();
      await page.getByRole('button', { name: 'Arm one', exact: true }).click();

      const downloading = page.waitForEvent('download');

      await page.getByRole('button', { name: 'Link Build', exact: true }).click();

      const download = await downloading;
      const reference = JSON.parse(await fs.readFile((await download.path())!, 'utf8'));

      expect(reference).toEqual({
        ...evidence,
        format: 'basecase-fleet-build-reference',
        organization: admin.org,
        robot: robot.id,
      });
      expect(JSON.stringify(reference)).not.toMatch(/credential|password|token/);
      expect((await admin.list('robot')).items.map((item: { id: string }) => item.id)).toEqual([robot.id]);
      expect((await admin.result('GET', `robot/${robot.id}`)).attributes.controller).toBe('retained');

      const deniedContext = await browser.newContext();
      const denied = await deniedContext.newPage();

      denied.on('request', (request) => requests.push({ url: request.url(), method: request.method() }));
      await denied.goto(`${fixture.origin}/fleet#${buildEvidenceFragment(evidence)}`);
      await denied.getByRole('textbox', { name: 'Organization ID' }).fill(viewer.org);
      await denied.getByRole('textbox', { name: 'Email' }).fill(viewer.email);
      await denied.getByLabel('Password', { exact: true }).fill('fleet-fixture-password');
      await denied.getByRole('button', { name: 'Sign In', exact: true }).click();
      await denied.getByRole('button', { name: 'Arm one', exact: true }).click();
      await denied.getByRole('button', { name: 'Link Build', exact: true }).click();
      await expect.poll(() => denied.getByRole('alert').textContent()).toBe('Fleet request refused');
      expect(
        requests
          .filter((request) => request.method !== 'GET')
          .every((request) => /\/v1\/sessions$|\/robot\/[0-9a-f-]+$/.test(new URL(request.url).pathname)),
      ).toBe(true);
      expect(await page.pageErrors({ filter: 'all' })).toEqual([]);
      expect(await denied.pageErrors({ filter: 'all' })).toEqual([]);
      await deniedContext.close();
    } finally {
      await browser.close();
    }
  },
);
