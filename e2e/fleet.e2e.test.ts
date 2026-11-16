import { afterAll, beforeAll, expect, it } from 'vitest';
import { inject } from 'vitest';
import { attachLoopback } from '../tools/fleet/loopback.mjs';
import { fleetFixture } from '../tools/fleet/fixture.mjs';
import { StudioPublisher } from '../electron/fleet/studioPublisher.mjs';
import { openApp, openPlayTab, type App } from './harness';

let app: App;
let fixture: Awaited<ReturnType<typeof fleetFixture>>;
let viewer: Awaited<ReturnType<Awaited<ReturnType<typeof fleetFixture>>['bootstrap']>>;
let admin: typeof viewer;
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

  admin = await fixture.bootstrap('Hospital');

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
  await admin.update('account', viewer.id, { name: 'Ward viewer', roles: [] });
  await expect.poll(() => fleetPage.getByText('Delivery 01', { exact: true }).count()).toBe(0);
  await fleetPage.getByRole('button', { name: 'Reload Fleet', exact: true }).click();
  await expect.poll(() => fleetPage.getByRole('button', { name: 'Sign Out', exact: true }).count()).toBe(1);
  expect(await fleetPage.getByText('Delivery 01', { exact: true }).count()).toBe(0);
  await fleetPage.close();
  expect(app.errors).toEqual([]);
});

it('enrolls the invited account when the browser already has a Fleet session', async () => {
  const account = await admin.create('account', { name: 'New viewer', roles: [] });
  const invitation = await admin.result<{ token: string }>('POST', 'invitations', {
    account: account.id,
    email: `${account.id}@example.test`,
  });
  const browser = app.page.context().browser();

  if (!browser) throw new Error('Fleet enrollment requires a browser');

  const context = await browser.newContext();

  try {
    const page = await context.newPage();

    await page.goto(`${fixture.origin}/fleet`);
    await page.evaluate(
      async ({ org, email }) => {
        await fetch('/v1/sessions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ org, email, password: 'fleet-fixture-password' }),
        });
      },
      { org: viewer.org, email: viewer.email },
    );
    await page.goto(`${fixture.origin}/fleet/enroll#token=${invitation.token}`);
    await page.getByLabel('Password', { exact: true }).fill('new-viewer-password');
    await page.getByRole('button', { name: 'Enroll', exact: true }).click();
    await expect.poll(() => page.getByRole('button', { name: 'Sign Out', exact: true }).count()).toBe(1);

    const session = await page.evaluate(async () => (await fetch('/v1/me')).json());

    expect(session.account).toBe(account.id);
    expect(new URL(page.url()).hash).toBe('');
  } finally {
    await context.close();
  }
});
