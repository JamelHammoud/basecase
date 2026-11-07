import { describe, expect, it } from 'vitest';
import { checkProductLink, pageNamesPart, siteOf } from './linkCheck.mjs';

const page =
  (body, status = 200) =>
  async () =>
    new Response(body, { status });

describe('checkProductLink', () => {
  const part = { url: 'https://maker.example/p', mpn: 'VL53-L1X', name: 'Distance Sensor' };

  it('confirms a page that names the part number, however it is punctuated', async () => {
    expect((await checkProductLink(part, page('<h1>vl53l1x board</h1>'))).status).toBe('confirmed');
  });

  it('never fetches Amazon', async () => {
    const never = () => {
      throw new Error('fetched');
    };

    expect((await checkProductLink({ ...part, url: 'https://www.amazon.com/dp/B0' }, never)).status).toBe('store');
  });

  it("doesn't confirm a page about something else", async () => {
    const out = await checkProductLink(part, page('<h1>A different product</h1>'));

    expect(out.status).toBe('unconfirmed');
    expect(out.note).toContain('VL53-L1X');
  });

  it("doesn't confirm a dead link", async () => {
    expect((await checkProductLink(part, page('gone', 404))).status).toBe('unconfirmed');
  });

  it('ignores names too short to mean anything', () => {
    expect(pageNamesPart('abc', { mpn: 'A', name: 'ab' })).toBe(false);
  });

  it('compares sites, not hosts', () => {
    expect(siteOf('https://cdn.maker.example/a.step')).toBe(siteOf('https://www.maker.example/p'));
  });
});
