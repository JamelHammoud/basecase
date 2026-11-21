export async function workflowInteractions(page) {
  await page.getByRole('button', { name: 'Layers', exact: true }).click();
  await page.evaluate(() => window.__workflowWatch('select', null));
  await page.getByText('Control plate', { exact: true }).first().click();
  await page.waitForFunction(() => window.__workflow.inputs.some((input) => input.kind === 'select'));
  await page.getByRole('tab', { name: 'Inspect', exact: true }).first().click();
  await page.getByLabel('Position X', { exact: true }).fill('37');
  await page.evaluate(() => window.__workflowWatch('edit', 37));
  await page.getByLabel('Position X', { exact: true }).press('Enter');
  await page.waitForFunction(() => window.__workflow.inputs.some((input) => input.kind === 'edit'));

  const canvas = page.locator('canvas:not([inert] *):visible').first();
  const bounds = await canvas.boundingBox();

  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
}

export async function orbitDuringWork(page) {
  const canvas = page.locator('canvas:not([inert] *):visible').first();
  const bounds = await canvas.boundingBox();
  const session = await page.context().newCDPSession(page);
  const pending = new Set();
  const failures = [];
  const timer = setInterval(() => {
    const input = session
      .send('Input.dispatchMouseEvent', {
        type: 'mouseWheel',
        x: bounds.x + bounds.width / 2,
        y: bounds.y + bounds.height / 2,
        deltaX: 20,
        deltaY: 5,
      })
      .catch((error) => failures.push(error))
      .finally(() => pending.delete(input));

    pending.add(input);
  }, 40);

  return async () => {
    clearInterval(timer);
    await Promise.allSettled([...pending]);
    await session.detach();

    if (failures.length) throw failures[0];

    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  };
}
