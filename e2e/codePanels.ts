import type { Locator, Page } from 'playwright-core';
import { expect } from 'vitest';

export const JOYSTICK = `<canvas width="200" height="200" style="display:block;margin:auto;touch-action:none"></canvas>
<script>
const pad = document.querySelector('canvas');
const g = pad.getContext('2d');
const draw = (x, y) => {
  g.clearRect(0, 0, 200, 200);
  g.fillStyle = getComputedStyle(document.body).getPropertyValue('--bc-surface');
  g.beginPath(); g.arc(100, 100, 90, 0, 6.29); g.fill();
  g.fillStyle = getComputedStyle(document.body).getPropertyValue('--bc-accent');
  g.beginPath(); g.arc(100 + x * 70, 100 + y * 70, 26, 0, 6.29); g.fill();
};
const clamp = (n) => Math.max(-1, Math.min(1, n));
const move = (e) => {
  const x = clamp((e.offsetX - 100) / 70);
  const y = clamp((e.offsetY - 100) / 70);
  draw(x, y);
  basecase.drive({ v: [-y, 0, -x] });
};
pad.addEventListener('pointerdown', (e) => { pad.setPointerCapture(e.pointerId); basecase.action('drive'); move(e); });
pad.addEventListener('pointermove', (e) => { if (pad.hasPointerCapture(e.pointerId)) move(e); });
pad.addEventListener('pointerup', () => { draw(0, 0); basecase.drive(null); });
draw(0, 0);
</script>`;

export const HUD = `<div style="padding:8px 12px;font-size:var(--bc-text);color:var(--bc-ink)">
  <b data-speed>0.00</b> m/s, tilt <b data-tilt>0</b>°
</div>
<script>
basecase.signals(['robot.speed', 'robot.tilt'], (v) => {
  document.querySelector('[data-speed]').textContent = (v['robot.speed'] ?? 0).toFixed(2);
  document.querySelector('[data-tilt]').textContent = (v['robot.tilt'] ?? 0).toFixed(0);
});
</script>`;

export const COCKPIT = {
  input: ['code', 'keys'],
  panels: [
    { id: 'stick', kind: 'code', title: 'Stick', height: 240, source: JOYSTICK },
    { id: 'hud', kind: 'code', source: HUD },
  ],
  layout: {
    areas: [
      { canvas: true, overlays: [{ panel: 'hud', anchor: 'top-left', width: 240, height: 48 }] },
      { size: 320, panels: ['stick'] },
    ],
  },
};

export async function pushStick(page: Page, pad: Locator) {
  const box = await pad.boundingBox();
  const [cx, cy] = [box!.x + box!.width / 2, box!.y + box!.height / 2];
  let nudge = 0;

  await expect
    .poll(async () => {
      await page.mouse.move(cx + (nudge++ % 2), cy);

      return pad.evaluate((el) => el.matches(':hover'));
    })
    .toBe(true);
  await page.mouse.down();
  await page.mouse.move(cx, cy - 70, { steps: 4 });
}
