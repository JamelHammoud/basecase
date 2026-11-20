import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { imageProblem } from './imageHealth.mjs';

export async function captureArticle(page, { path: destination, ready }) {
  await ready.waitFor({ state: 'visible' });
  await page.locator('#boot').waitFor({ state: 'detached' });
  await page.waitForFunction(() => !document.documentElement.matches('.booting, .boot-leaving'));
  await page.evaluate(() => document.fonts.ready.then(() => undefined));

  const image = await page.screenshot({ animations: 'disabled' });
  const problem = await imageProblem(image);

  if (problem) throw new Error(`${destination}: ${problem}`);

  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, image);
}
