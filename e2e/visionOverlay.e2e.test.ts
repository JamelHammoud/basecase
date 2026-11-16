import type { Browser } from 'playwright-core';
import { afterEach, expect, it } from 'vitest';
import { launchChrome } from './harness';
import { operatorOverlayState } from './visionOverlay';

let browser: Browser;

afterEach(async () => {
  await browser?.close();
});

it('counts visible operator faces exactly while excluding hidden and inactive tiles', async () => {
  browser = await launchChrome();

  const page = await browser.newPage();

  await page.setContent(`
    <style>[data-testid="vision-box"] { width: 20px; height: 20px; }</style>
    <div data-camera="operator" data-testid="camera-tile">
      <div data-testid="vision-overlay" data-timestamp="123">
        <div data-testid="vision-box" data-label="face"></div>
        <div data-testid="vision-box" data-label="person"></div>
        <div data-testid="vision-box" data-label="face" style="display:none"></div>
        <div data-testid="vision-box" data-label="face" style="visibility:hidden"></div>
        <div data-testid="vision-box" data-label="face" style="width:0"></div>
      </div>
    </div>
    <div data-camera="wrist"><div data-testid="vision-box" data-label="face"></div></div>
    <div inert><div data-camera="operator" data-testid="camera-tile">
      <div data-testid="vision-box" data-label="face"></div>
    </div></div>
    <div style="display:none"><div data-camera="operator" data-testid="camera-tile">
      <div data-testid="vision-box" data-label="face"></div>
    </div></div>
  `);
  expect(await page.evaluate(operatorOverlayState, false)).toMatchObject({ visibleTiles: 1, visibleFaces: 1 });
  expect(await page.evaluate(operatorOverlayState, true)).toBe(false);
  await page.evaluate(() => {
    const face = document.querySelector<HTMLElement>('[data-testid="vision-box"]')!;

    face.style.opacity = '0';
  });
  expect(await page.evaluate(operatorOverlayState, false)).toMatchObject({ visibleTiles: 1, visibleFaces: 1 });
  await page.evaluate(() => {
    const overlay = document.querySelector('[data-testid="vision-overlay"]')!;

    overlay.append(overlay.firstElementChild!.cloneNode());
  });
  expect(await page.evaluate(operatorOverlayState, false)).toMatchObject({ visibleTiles: 1, visibleFaces: 2 });
  await page.evaluate(() => document.querySelector('[data-camera="operator"]')!.setAttribute('inert', ''));
  expect(await page.evaluate(operatorOverlayState, false)).toMatchObject({ visibleTiles: 0, visibleFaces: 0 });
});
