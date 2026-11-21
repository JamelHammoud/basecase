import { afterAll, beforeAll, expect, inject, it } from 'vitest';
import type { FleetResource } from '../tools/fleet/fixture.mjs';
import { fleetFixture } from '../tools/fleet/fixture.mjs';
import { localIdp } from '../tools/fleet/localIdp.mjs';
import { launchChrome } from './harness';

let fixture: Awaited<ReturnType<typeof fleetFixture>>;
let first: Awaited<ReturnType<typeof localIdp>>;
let second: Awaited<ReturnType<typeof localIdp>>;

beforeAll(async () => {
  fixture = await fleetFixture({
    assets: async (_request, response, url) => {
      const result = await fetch(`${inject('webUrl')}${url.pathname}${url.search}`);

      response.writeHead(result.status, { 'Content-Type': result.headers.get('content-type') ?? 'text/plain' });
      response.end(Buffer.from(await result.arrayBuffer()));
    },
  });
  [first, second] = await Promise.all([localIdp(), localIdp()]);
});

afterAll(async () => {
  await Promise.all([fixture?.close(), first?.close(), second?.close()]);
});

it('configures two Fleet providers, signs in with distinct site scopes and removes live access through SCIM', async () => {
  const admin = await fixture.bootstrap('Federated hospital');
  const additionalRole = await admin.create('role', { name: 'Additional viewer', rules: [] });
  const entries: { idp: typeof first; role: FleetResource; robot: FleetResource; name: string }[] = [];

  for (const [index, idp] of [first, second].entries()) {
    const site = await admin.create('site', { name: `Ward ${index + 1}` });
    const robot = await admin.create('robot', { name: `Delivery ${index + 1}`, parent: site.id });
    const role = await admin.create('role', {
      name: `Viewer ${index + 1}`,
      rules: [{ effect: 'allow', scope: site.id, actions: ['inventory.view'] }],
    });

    entries.push({ idp, role, robot, name: `Subsidiary ${index + 1}` });
  }

  const browser = await launchChrome();

  try {
    const context = await browser.newContext();
    const page = await context.newPage();

    await context.addCookies([{ name: 'fleet_session', value: admin.token, url: `${fixture.origin}/v1` }]);
    await page.goto(`${fixture.origin}/fleet`);
    await page.getByRole('button', { name: 'Access', exact: true }).click();

    for (const entry of entries) {
      await page.getByLabel('Provider name', { exact: true }).fill(entry.name);
      await page.getByLabel('Issuer', { exact: true }).fill(entry.idp.issuer);
      await page.getByLabel('Sign-in URL').fill(entry.idp.entryPoint);
      await page.getByLabel('Signing certificates').fill(entry.idp.key.publicKey);
      await page.getByRole('button', { name: 'Add Group Grant' }).click();
      await page.getByRole('textbox', { name: 'Provider group' }).fill('ward');
      await page.getByRole('combobox', { name: 'Fleet role' }).selectOption(entry.role.id);
      await page.getByRole('button', { name: 'Save Provider' }).click();
      await expect.poll(() => page.getByRole('button', { name: entry.name, exact: true }).count()).toBe(1);
    }

    const configured = await admin.list('connections');
    const firstProvider = configured.items.find((item: { name: string }) => item.name === entries[0].name);

    if (!firstProvider) throw new Error('Configured provider is missing');

    await admin.update('connections', firstProvider.id, {
      ...firstProvider,
      mappings: [{ group: 'ward', roles: [entries[0].role.id, additionalRole.id] }],
    });
    await page.reload();
    await page.getByRole('button', { name: 'Access', exact: true }).click();
    await page.getByRole('button', { name: entries[0].name, exact: true }).click();
    expect(await page.getByRole('combobox', { name: 'Fleet role' }).count()).toBe(2);
    await page.getByRole('combobox', { name: 'Fleet role' }).first().selectOption(additionalRole.id);
    await page.getByRole('combobox', { name: 'Fleet role' }).first().selectOption(entries[0].role.id);
    await page.getByRole('button', { name: 'Save Provider' }).click();
    await expect.poll(() => page.getByLabel('Provider name', { exact: true }).inputValue()).toBe('');

    const providers = await admin.list('connections');

    expect(providers.items.find((item) => item.id === firstProvider.id)).toHaveProperty('mappings', [
      { group: 'ward', roles: [entries[0].role.id, additionalRole.id] },
    ]);

    const provider = providers.items.find((item: { name: string }) => item.name === entries[1].name);

    if (!provider) throw new Error('Configured provider is missing');

    const credential = await admin.result<{ token: string }>('POST', `connections/${provider.id}/scim-token`, {});
    const identities = [];

    await page.getByRole('button', { name: 'Sign Out', exact: true }).click();

    for (const entry of entries) {
      await page.getByRole('textbox', { name: 'Organization ID' }).fill(admin.org);
      await page.getByRole('button', { name: 'Sign In with SSO' }).click();
      await page.getByRole('button', { name: entry.name, exact: true }).click();
      await expect.poll(() => page.getByText(entry.robot.name, { exact: true }).count()).toBe(1);
      expect(await page.getByText(entries.find((item) => item !== entry)!.robot.name, { exact: true }).count()).toBe(0);
      identities.push(await page.evaluate(async () => (await fetch('/v1/me')).json()));

      if (entry === entries[0]) await page.getByRole('button', { name: 'Sign Out', exact: true }).click();
    }

    expect(identities[0].account).not.toBe(identities[1].account);

    const endpoint = `${fixture.origin}/scim/v2/${admin.org}/${provider.id}/Users`;
    const headers = { Authorization: `Bearer ${credential.token}`, 'Content-Type': 'application/scim+json' };
    const user = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({ externalId: 'same-subject', userName: 'same@example.test', active: false }),
    });

    expect(user.status).toBe(201);
    await expect.poll(() => page.getByText(entries[1].robot.name, { exact: true }).count()).toBe(0);
    expect(await page.evaluate(async () => (await fetch('/v1/me')).status)).toBe(401);
    expect(await page.pageErrors({ filter: 'all' })).toEqual([]);
  } finally {
    await browser.close();
  }
});
