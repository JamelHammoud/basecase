import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { addScroll, scrollAt, scrolledBy } from './scrollShift.mjs';
import { createSession } from './session.mjs';

const WIDTH = 600;
const HEIGHT = 900;

function listShot(offset, dpr = 1) {
  const w = WIDTH * dpr;
  const h = HEIGHT * dpr;
  const pixels = Buffer.alloc(w * h);

  for (let y = 0; y < h; y++) {
    const page = Math.floor(y / dpr) + offset;
    const shade = page < 60 ? 40 : 30 + ((page * 37) % 97) + (Math.floor(page / 52) % 2) * 60;

    pixels.fill(shade, y * w, (y + 1) * w);
  }

  return sharp(pixels, { raw: { width: w, height: h, channels: 1 } })
    .png()
    .toBuffer();
}

describe('PersonaLab scroll tracking', () => {
  it('measures how far a list scrolled from two screenshots', async () => {
    const before = await listShot(0);
    const after = await listShot(240);

    expect(await scrolledBy({ before, after, x: 200, maxPx: 400 })).toBe(240);
  });

  it('measures it on a Retina screenshot too', async () => {
    const before = await listShot(100, 2);
    const after = await listShot(20, 2);

    expect(await scrolledBy({ before, after, x: 200, maxPx: 400, devicePixelRatio: 2 })).toBe(-80);
  });

  it('keeps one running offset per column', () => {
    const bands = [];

    addScroll(bands, { x: 190, px: 300 });
    addScroll(bands, { x: 220, px: -100 });
    addScroll(bands, { x: 1300, px: 50 });

    expect([scrollAt(bands, 200), scrollAt(bands, 1290), scrollAt(bands, 700)]).toEqual([200, 50, 0]);
  });

  it('reports a control found after scrolling at its place before the scroll', async () => {
    const shots = [await listShot(0), await listShot(0), await listShot(300)];
    const screen = {
      screenshot: async () => shots.shift() ?? (await listShot(300)),
      accessibilityTree: async () => '',
      click: async () => {},
      type: async () => {},
      press: async () => {},
      scroll: async () => {},
    };
    const session = createSession({ screen, minutes: 1, devicePixelRatio: 1 });

    await session.handlers.click({ x: 200, y: 400 });
    await session.handlers.scroll({ dy: 300 });
    session.handlers.report({ where: 'Unlabelled row', x: 200, y: 700, problem: 'No name.' });

    expect(session.findings[0].at).toEqual([200, 1000]);
  });
});
