import { afterAll, beforeAll, expect, it } from 'vitest';
import { inject } from 'vitest';
import { attachLoopback } from '../tools/fleet/loopback.mjs';
import { fleetFixture } from '../tools/fleet/fixture.mjs';
import { StudioPublisher } from '../electron/fleet/studioPublisher.mjs';
import { openApp, openPlayTab, type App } from './harness';

let app: App;
let fixture: Awaited<ReturnType<typeof fleetFixture>>;
let viewer: Awaited<ReturnType<Awaited<ReturnType<typeof fleetFixture>>['bootstrap']>>;
let foreignSite: string;
let publisher: StudioPublisher;
let loopback: Awaited<ReturnType<typeof attachLoopback>>;

beforeAll(async () => {
  fixture = await fleetFixture({
    assets: async (_request, response, url) => {
      const result = await fetch(`${inject('webUrl')}${url.pathname}${url.search}`);

      response.writeHead(result.status, { 'Content-Type': result.headers.get('content-type') ?? 'text/plain' });
      response.end(Buffer.from(await result.arrayBuffer()));
    },
  });

  const admin = await fixture.bootstrap('Hospital');
  const site = await admin.create('site', { name: 'Ward A' });
  const other = await admin.create('site', { name: 'Ward B' });
  const robot = await admin.create('robot', { name: 'Delivery 01', parent: site.id });
  const role = await admin.create('role', {
    name: 'Ward viewer',
    rules: [{ effect: 'allow', scope: site.id, actions: ['inventory.view'], conditions: {} }],
  });

  viewer = await admin.enroll('ward@example.test', [role.id]);
  foreignSite = other.id;

  const credential = await admin.service([
    { effect: 'allow', scope: site.id, actions: ['status.publish'], conditions: {} },
  ]);

  publisher = new StudioPublisher({
    origin: fixture.origin,
    org: admin.org,
    token: credential.token,
    units: { robot: robot.id },
  });
  loopback = await attachLoopback(publisher);
  app = await openApp();
});

afterAll(async () => {
  await app?.close();
  await loopback?.close();
  await fixture?.close();
});

it('opens Fleet from Operate, restricts a site viewer and reopens persistent inventory', async () => {
  await openPlayTab(app.page, 'Operate');
  await app.page.getByRole('textbox', { name: 'Fleet address' }).fill(fixture.origin);

  const popup = app.page.waitForEvent('popup');

  await app.page.getByRole('button', { name: 'Open Fleet', exact: true }).click();

  const fleetPage = await popup;

  await fleetPage.getByRole('textbox', { name: 'Organization ID' }).fill(viewer.org);
  await fleetPage.getByRole('textbox', { name: 'Email' }).fill(viewer.email);
  await fleetPage.getByLabel('Password', { exact: true }).fill('fleet-fixture-password');
  await fleetPage.getByRole('button', { name: 'Sign In', exact: true }).click();
  await expect.poll(() => fleetPage.getByText('Delivery 01', { exact: true }).count()).toBe(1);
  expect(await fleetPage.getByText('Ward A', { exact: true }).count()).toBeGreaterThan(0);
  expect(await fleetPage.getByText('Ward B', { exact: true }).count()).toBe(0);

  const status = await fleetPage.evaluate(async ({ org, site }) => (await fetch(`/v1/${org}/site/${site}`)).status, {
    org: viewer.org,
    site: foreignSite,
  });

  expect(status).toBe(403);
  await fixture.restart();
  await fleetPage.reload();
  await expect.poll(() => fleetPage.getByText('Delivery 01', { exact: true }).count()).toBe(1);
  await fleetPage.close();
  expect(app.errors).toEqual([]);
});
