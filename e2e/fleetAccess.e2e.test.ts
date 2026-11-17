import { afterAll, beforeAll, expect, inject, it } from 'vitest';
import { fleetFixture } from '../tools/fleet/fixture.mjs';
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

it('creates a scoped role and invitation in Access, changes a group grant and revokes the enrolled browser', async () => {
  const admin = await fixture.bootstrap('Warehouse access');
  const site = await admin.create('site', { name: 'Warehouse' });
  const other = await admin.create('site', { name: 'Harbor' });
  const harborRole = await admin.create('role', {
    name: 'Harbor viewer',
    rules: [{ effect: 'allow', scope: other.id, actions: ['inventory.view'] }],
  });
  const robot = await admin.create('robot', { name: 'Warehouse unit', parent: site.id });
  const browser = await launchChrome();

  try {
    const context = await browser.newContext();
    const page = await context.newPage();

    await context.addCookies([{ name: 'fleet_session', value: admin.token, url: `${fixture.origin}/v1` }]);
    await page.goto(`${fixture.origin}/fleet`);
    await page.getByRole('button', { name: 'Access', exact: true }).click();
    await page.getByLabel('Resource').selectOption('role');
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    await page.getByLabel('Name', { exact: true }).fill('Warehouse viewer');
    await page.getByRole('button', { name: 'Add Rule', exact: true }).click();
    await page.getByLabel('Scope resource', { exact: true }).selectOption(site.id);
    await page.getByLabel('inventory.view', { exact: true }).check();
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect.poll(() => page.getByRole('button', { name: /Warehouse viewer/ }).count()).toBe(1);
    await page.getByLabel('Resource').selectOption('account');
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    await page.getByLabel('Name', { exact: true }).fill('Warehouse operator');
    await page
      .getByRole('group', { name: 'Roles', exact: true })
      .getByRole('combobox')
      .selectOption((await admin.list('role')).items.find((item) => item.name === 'Warehouse viewer')!.id);
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.getByRole('button', { name: /Warehouse operator/ }).click();
    await page.getByLabel('Email', { exact: true }).fill('warehouse-operator@example.test');
    await page.getByRole('button', { name: 'Invite', exact: true }).click();

    const enrollment = await page.getByLabel('Enrollment link').inputValue();
    const operatorContext = await browser.newContext();
    const operator = await operatorContext.newPage();

    await operator.goto(enrollment);
    await operator.getByLabel('Password', { exact: true }).fill('warehouse-operator-password');
    await operator.getByRole('button', { name: 'Enroll', exact: true }).click();

    await expect.poll(() => operator.getByText(robot.name, { exact: true }).count()).toBe(1);
    expect(
      await operator.evaluate(async ({ org, site }) => (await fetch(`/v1/${org}/site/${site}`)).status, {
        org: admin.org,
        site: other.id,
      }),
    ).toBe(403);

    const account = (await admin.list('account')).items.find((item) => item.name === 'Warehouse operator')!;

    await page.getByLabel('Resource').selectOption('group');
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    await page.getByLabel('Name', { exact: true }).fill('Warehouse operators');
    await page.getByRole('group', { name: 'Roles', exact: true }).getByRole('combobox').selectOption(harborRole.id);
    await page.getByRole('group', { name: 'Members', exact: true }).getByRole('combobox').selectOption(account.id);
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect.poll(() => page.getByRole('button', { name: /Warehouse operators/ }).count()).toBe(1);

    const statuses = await operator.evaluate(
      async ({ org, allowed, denied }) =>
        Promise.all([allowed, denied].map(async (id) => (await fetch(`/v1/${org}/site/${id}`)).status)),
      { org: admin.org, allowed: site.id, denied: other.id },
    );

    expect(statuses).toEqual([200, 200]);
    await operator.reload();
    await expect.poll(() => operator.getByText(robot.name, { exact: true }).count()).toBe(1);

    const session = await operator.evaluate(async () => (await (await fetch('/v1/me')).json()).credential as string);

    await page.getByLabel('Resource').selectOption('credentials');
    await page.getByRole('row').filter({ hasText: session }).getByRole('button', { name: 'Revoke' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Delete', exact: true }).click();
    await expect.poll(() => operator.getByText(robot.name, { exact: true }).count()).toBe(0);
    expect(await operator.evaluate(async () => (await fetch('/v1/me')).status)).toBe(401);
    expect(await page.pageErrors({ filter: 'all' })).toEqual([]);
    expect(await operator.pageErrors({ filter: 'all' })).toEqual([]);
    await operatorContext.close();
  } finally {
    await browser.close();
  }
});

it('preserves unfamiliar role meaning after validation and reload, then clears edits on administrative denial', async () => {
  const admin = await fixture.bootstrap('Role editor');
  const role = await admin.create('role', {
    name: 'Road operator',
    attributes: { unfamiliar: 'retained' },
    rules: [
      {
        effect: 'allow',
        scope: '*',
        actions: ['inventory.view', 'inventory.export'],
        conditions: { robot: { 'future-key': ['a\nb', 'c'] }, site: { district: ['west', 'north'] } },
      },
      { effect: 'deny', scope: admin.org, actions: ['robot.control'], conditions: {} },
    ],
  });
  const original = await admin.result<{ rules: unknown[]; attributes: unknown }>('GET', `role/${role.id}`);
  const browser = await launchChrome();

  try {
    const context = await browser.newContext();
    const page = await context.newPage();

    await context.addCookies([{ name: 'fleet_session', value: admin.token, url: `${fixture.origin}/v1` }]);
    await page.goto(`${fixture.origin}/fleet`);
    await page.getByRole('button', { name: 'Access', exact: true }).click();
    await page.getByLabel('Resource', { exact: true }).selectOption('role');
    await page.getByRole('button', { name: /Road operator/ }).click();
    expect(await page.getByLabel('robot: future-key 1', { exact: true }).inputValue()).toBe('a\nb');
    await page.getByLabel('Name', { exact: true }).fill('Road operator renamed');
    await page.getByLabel('inventory.view', { exact: true }).first().uncheck();
    await page.getByLabel('inventory.export', { exact: true }).first().uncheck();
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.getByRole('alert').waitFor();
    expect(await page.getByLabel('Name', { exact: true }).inputValue()).toBe('Road operator renamed');
    await page.getByLabel('inventory.view', { exact: true }).first().check();
    await page.getByLabel('inventory.export', { exact: true }).first().check();
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.getByRole('button', { name: /Road operator renamed/ }).waitFor();

    const saved = await admin.result<{ rules: unknown[]; attributes: unknown }>('GET', `role/${role.id}`);

    expect(saved.rules).toEqual(original.rules);
    expect(saved.attributes).toEqual(original.attributes);
    await page.reload();
    await page.getByRole('button', { name: 'Access', exact: true }).click();
    await page.getByLabel('Resource', { exact: true }).selectOption('role');
    await page.getByRole('button', { name: /Road operator renamed/ }).click();
    expect(await page.getByLabel('robot: future-key 1', { exact: true }).inputValue()).toBe('a\nb');
    await page.getByLabel('Name', { exact: true }).fill('Must not save');
    await admin.remove('credentials', admin.credential);
    await page.getByRole('alert').waitFor();
    expect(await page.getByRole('button', { name: 'Save', exact: true }).count()).toBe(0);
    expect(await page.getByLabel('Name', { exact: true }).count()).toBe(0);
    expect(await page.pageErrors({ filter: 'all' })).toEqual([]);
  } finally {
    await browser.close();
  }
});
