import { afterAll, beforeAll, expect, inject, it } from 'vitest';
import { fleetFixture } from '../tools/fleet/fixture.mjs';
import { recoveryCommand } from '../tools/fleet/recoveryCommand.mjs';
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

afterAll(async () => {
  await fixture?.close();
});

it('recovers the existing Fleet through the local command and signs in after restart', async () => {
  const admin = await fixture.bootstrap('Recovery hospital');
  const site = await admin.create('site', { name: 'Original ward' });
  const robot = await admin.create('robot', { name: 'Delivery original', parent: site.id });
  const run = (command: string, input?: unknown) => recoveryCommand(fixture.databaseUrl, command, admin.org, input);

  expect((await run('recovery-setup', { email: 'local@example.test', password: 'first-local-password' })).code).toBe(0);
  await admin.remove('account', admin.id);
  expect((await run('recover', { password: 'recovered-local-password' })).code).toBe(0);
  expect((await admin.call('GET', 'robot')).status).toBe(401);
  await fixture.restart();

  const browser = await launchChrome();

  try {
    const page = await browser.newPage();

    await page.goto(`${fixture.origin}/fleet`);
    await page.getByRole('textbox', { name: 'Organization ID' }).fill(admin.org);
    await page.getByRole('textbox', { name: 'Email' }).fill('local@example.test');
    await page.getByLabel('Password', { exact: true }).fill('recovered-local-password');
    await page.getByRole('button', { name: 'Sign In', exact: true }).click();
    await expect.poll(() => page.getByText('Delivery original', { exact: true }).count()).toBe(1);

    const current = await page.evaluate(async () => (await fetch('/v1/me')).json());
    const inventory = await page.evaluate(async (org) => (await fetch(`/v1/${org}/robot`)).json(), admin.org);
    const audit = await run('recovery-audit');

    expect(current.org).toBe(admin.org);
    expect(inventory.items.map((item: { id: string }) => item.id)).toContain(robot.id);
    expect(JSON.parse(audit.stdout).items.some((item: { action: string }) => item.action === 'recovery.use')).toBe(
      true,
    );
    expect(await page.pageErrors({ filter: 'all' })).toEqual([]);
  } finally {
    await browser.close();
  }
});
