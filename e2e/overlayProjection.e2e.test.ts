import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { openApp, type App } from './harness';

let app: App;

interface Studio {
  load: (record: unknown) => void;
  projectPoints: (points: number[][]) => Array<{ x: number; y: number; visible: boolean }>;
}

const point = [60, 20, 30];

async function pinPosition() {
  return app.page.getByRole('button', { name: 'Comment 1', exact: true }).evaluate((pin) => {
    const parent = pin.parentElement!;
    const matrix = new DOMMatrix(parent.style.transform);

    return { x: matrix.m41, y: matrix.m42, visible: parent.style.visibility === 'visible' };
  });
}

async function expectPinAtAnchor() {
  await expect
    .poll(async () => {
      const expected = await app.page.evaluate(
        (position) => (window as unknown as { __studio: Studio }).__studio.projectPoints([position])[0],
        point,
      );
      const actual = await pinPosition();

      return actual.visible && Math.abs(actual.x - expected.x) <= 1 && Math.abs(actual.y - expected.y) <= 1;
    })
    .toBe(true);
}

beforeAll(async () => {
  app = await openApp();
  await app.page.evaluate((position) => {
    (window as unknown as { __studio: Studio }).__studio.load({
      parts: [],
      annotations: [
        {
          id: 'note',
          position,
          createdAt: '2026-11-14T00:00:00Z',
          comments: [{ id: 'first', text: 'Move this hole', createdAt: '2026-11-14T00:00:00Z' }],
        },
      ],
    });
  }, point);
}, 120000);

afterAll(async () => {
  await app?.close();
});

describe('viewport overlay projection', () => {
  it('keeps comment pins on their anchors through camera changes and canvas resizing', async () => {
    await expectPinAtAnchor();

    const beforeCamera = await pinPosition();

    await app.page.keyboard.press('3');
    await expect.poll(pinPosition).not.toEqual(beforeCamera);
    await expectPinAtAnchor();

    const beforeResize = await pinPosition();

    await app.page.setViewportSize({ width: 1600, height: 1000 });
    await expect.poll(pinPosition).not.toEqual(beforeResize);
    await expectPinAtAnchor();
    expect(app.errors).toEqual([]);
  });
});
