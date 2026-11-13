import https from 'node:https';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { connectPhone, fetchPage } from '../../e2e/phoneClient.ts';
import { PhonePairing } from './phonePairing.mjs';
import { CLOSE, maskedFrame, OPCODE } from './wsFrames.mjs';

const GOOD = JSON.stringify({ tilt: [10.5, -20], pad: [0.25, -1], buttons: [true, false] });
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148';
const pairings = [];

async function startPairing() {
  const events = [];
  const pairing = new PhonePairing({ emit: (event) => events.push(event), address: () => '127.0.0.1' });

  pairings.push(pairing);

  const paired = await pairing.pair();

  if (!paired.ok) throw new Error(paired.message);

  const url = new URL(paired.url);
  const socketUrl = `https://${url.host}/socket?t=${paired.token}`;
  const inputs = () => events.filter((event) => event.type === 'phone-input');
  const closed = () => events.some((event) => event.type === 'phone' && event.state === 'closed');

  return { pairing, paired, ca: paired.cert, host: url.host, socketUrl, events, inputs, closed };
}

function pageResponse(url, ca) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { ca, agent: false }, (res) => {
        let body = '';

        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
      })
      .on('error', reject);
  });
}

const withToken = (session, token) => `https://${session.host}/socket?t=${encodeURIComponent(token)}`;

afterEach(() => {
  pairings.splice(0).forEach((pairing) => pairing.dispose());
});

describe('PhonePairing', () => {
  it('serves the page with its token, a nonce CSP and no caching', async () => {
    const session = await startPairing();
    const page = await pageResponse(session.paired.url, session.ca);
    const nonce = /<script nonce="([^"]+)">/.exec(page.body)?.[1];

    expect(page.status).toBe(200);
    expect(page.headers['content-type']).toBe('text/html; charset=utf-8');
    expect(page.headers['cache-control']).toBe('no-store');
    expect(page.headers['x-content-type-options']).toBe('nosniff');
    expect(page.headers['referrer-policy']).toBe('no-referrer');
    expect(page.headers['content-security-policy']).toBe(
      `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; connect-src wss://${session.host}; ` +
        "img-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
    );
    expect(page.body).toContain('Tilt to drive');

    const { url, token, cert } = session.paired;

    expect(session.pairing.state()).toEqual({ status: 'pairing', url, token, cert });
  });

  it('connects one phone, names it and emits only checked input', async () => {
    const session = await startPairing();
    const phone = await connectPhone(session.paired.url, { ca: session.ca, headers: { 'User-Agent': IPHONE } });

    phone.send(GOOD);
    await vi.waitFor(() => expect(session.inputs()).toHaveLength(1));
    expect(session.events[0]).toEqual({ type: 'phone', state: 'connected', name: 'iPhone' });
    expect(session.inputs()[0]).toEqual({
      type: 'phone-input',
      tilt: [10.5, -20],
      pad: [0.25, -1],
      buttons: [true, false],
    });
    expect(session.pairing.state()).toEqual({ status: 'connected', name: 'iPhone' });
  });
});

describe('PhonePairing refuses', () => {
  it('to pair without a LAN address, so no code points at loopback', async () => {
    const events = [];
    const pairing = new PhonePairing({ emit: (event) => events.push(event), address: () => null });

    pairings.push(pairing);

    expect(await pairing.pair()).toEqual({ ok: false, message: 'Connect to a network to pair a phone' });
    expect(pairing.state()).toEqual({ status: 'off' });
    expect(events).toEqual([]);
  });

  it('the page and the socket without a token', async () => {
    const session = await startPairing();

    expect(await fetchPage(`https://${session.host}/`, { ca: session.ca })).toBe(403);
    await expect(connectPhone(`https://${session.host}/socket`, { ca: session.ca })).rejects.toMatchObject({
      status: 403,
    });
  });

  it('a wrong token', async () => {
    const session = await startPairing();
    const { token } = session.paired;
    const wrong = `${token[0] === 'A' ? 'B' : 'A'}${token.slice(1)}`;

    expect(await fetchPage(`https://${session.host}/?t=${wrong}`, { ca: session.ca })).toBe(403);
    await expect(connectPhone(withToken(session, wrong), { ca: session.ca })).rejects.toMatchObject({ status: 403 });
  });

  it('a replayed token once a phone has connected', async () => {
    const session = await startPairing();

    await connectPhone(session.socketUrl, { ca: session.ca });
    await expect(connectPhone(session.socketUrl, { ca: session.ca })).rejects.toMatchObject({ status: 403 });
    expect(await fetchPage(session.paired.url, { ca: session.ca })).toBe(403);
  });

  it('a wrong Host header (DNS rebinding)', async () => {
    const session = await startPairing();
    const port = session.host.split(':')[1];
    const headers = { Host: `evil.example:${port}` };

    expect(await fetchPage(session.paired.url, { ca: session.ca, headers })).toBe(403);
    await expect(connectPhone(session.socketUrl, { ca: session.ca, headers })).rejects.toMatchObject({ status: 403 });
  });

  it('a cross-site Origin and Sec-Fetch-Site', async () => {
    const session = await startPairing();
    const origin = { Origin: 'https://evil.example' };
    const site = { 'Sec-Fetch-Site': 'cross-site' };

    await expect(connectPhone(session.socketUrl, { ca: session.ca, headers: origin })).rejects.toMatchObject({
      status: 403,
    });
    await expect(connectPhone(session.socketUrl, { ca: session.ca, headers: site })).rejects.toMatchObject({
      status: 403,
    });
    expect(await fetchPage(session.paired.url, { ca: session.ca, headers: origin })).toBe(403);
    expect(session.pairing.state().status).not.toBe('connected');
  });

  it('any other path with 404', async () => {
    const session = await startPairing();

    expect(await fetchPage(`https://${session.host}/other?t=${session.paired.token}`, { ca: session.ca })).toBe(404);
  });

  it('messages outside the schema and keeps the socket open', async () => {
    const session = await startPairing();
    const phone = await connectPhone(session.socketUrl, { ca: session.ca });
    const hostile = [
      JSON.stringify({ tilt: [0, 0], pad: null, buttons: [false, false], extra: 1 }),
      JSON.stringify({ tilt: ['1', '2'], pad: null, buttons: [false, false] }),
      JSON.stringify({ tilt: [181, 0], pad: null, buttons: [false, false] }),
      JSON.stringify({ tilt: [0, 0], pad: [2, 0], buttons: [false, false] }),
      JSON.stringify([{ tilt: [0, 0], pad: null, buttons: [false, false] }]),
      '{"__proto__":{"tilt":[0,0]},"tilt":[0,0],"pad":null,"buttons":[false,false]}',
      'not json',
    ];

    hostile.forEach((text) => phone.send(text));
    phone.send(GOOD);
    await vi.waitFor(() => expect(session.inputs()).toHaveLength(1));
    expect(session.inputs()[0].tilt).toEqual([10.5, -20]);
    expect(session.closed()).toBe(false);
  });

  it('a binary frame: it closes and never emits it', async () => {
    const session = await startPairing();
    const phone = await connectPhone(session.socketUrl, { ca: session.ca });

    phone.sendRaw(maskedFrame(OPCODE.binary, GOOD));
    await phone.closed;
    expect(phone.closeCode()).toBe(CLOSE.protocol);
    expect(session.inputs()).toHaveLength(0);
    expect(session.closed()).toBe(true);
  });

  it('an unmasked frame: it closes', async () => {
    const session = await startPairing();
    const phone = await connectPhone(session.socketUrl, { ca: session.ca });

    phone.sendRaw(Buffer.concat([Buffer.from([0x81, GOOD.length]), Buffer.from(GOOD)]));
    await phone.closed;
    expect(phone.closeCode()).toBe(CLOSE.protocol);
    expect(session.inputs()).toHaveLength(0);
  });

  it('an oversized frame: it closes', async () => {
    const session = await startPairing();
    const phone = await connectPhone(session.socketUrl, { ca: session.ca });

    phone.send(`${GOOD}${' '.repeat(600)}`);
    await phone.closed;
    expect(phone.closeCode()).toBe(CLOSE.tooBig);
    expect(session.inputs()).toHaveLength(0);
    expect(session.closed()).toBe(true);
  });

  it('more than 60 messages a second: of 200 messages sent in a burst', async () => {
    const session = await startPairing();
    const phone = await connectPhone(session.socketUrl, { ca: session.ca });

    phone.sendRaw(Buffer.concat(Array.from({ length: 200 }, () => maskedFrame(OPCODE.text, GOOD))));
    await vi.waitFor(() => expect(session.inputs()).toHaveLength(60));
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(session.inputs()).toHaveLength(60);
  });
});

describe('PhonePairing lifecycle', () => {
  it('answers a ping without emitting input', async () => {
    const session = await startPairing();
    const phone = await connectPhone(session.socketUrl, { ca: session.ca });

    phone.sendRaw(maskedFrame(OPCODE.ping, 'hi'));
    phone.send(GOOD);
    await vi.waitFor(() => expect(session.inputs()).toHaveLength(1));
    expect(session.closed()).toBe(false);
  });

  it('refuses new connections after unpair', async () => {
    const session = await startPairing();
    const phone = await connectPhone(session.socketUrl, { ca: session.ca });

    expect(session.pairing.unpair()).toEqual({ ok: true });
    await phone.closed;
    expect(phone.closeCode()).toBe(CLOSE.normal);
    expect(session.closed()).toBe(true);
    await expect(fetchPage(session.paired.url, { ca: session.ca })).rejects.toMatchObject({ code: 'ECONNREFUSED' });
    expect(session.pairing.state()).toEqual({ status: 'off' });
    expect(session.pairing.unpair()).toEqual({ ok: true });
    expect(session.events.filter((event) => event.state === 'closed')).toHaveLength(1);
  });

  it('ends the pairing when the phone closes its socket, and the port refuses', async () => {
    const session = await startPairing();
    const phone = await connectPhone(session.socketUrl, { ca: session.ca });

    phone.close();
    await vi.waitFor(() => expect(session.closed()).toBe(true));
    await expect(connectPhone(session.socketUrl, { ca: session.ca })).rejects.toMatchObject({
      code: 'ECONNREFUSED',
    });
    expect(session.pairing.state().status).toBe('off');
  });

  it('ends a pairing no phone joined after five minutes', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });

    try {
      const session = await startPairing();

      vi.advanceTimersByTime(5 * 60 * 1000);
      expect(session.closed()).toBe(true);
      expect(session.pairing.state().status).toBe('off');
    } finally {
      vi.useRealTimers();
    }
  });

  it('starts a fresh pairing with a new token and stops the old one', async () => {
    const session = await startPairing();
    const again = await session.pairing.pair();

    expect(again.ok).toBe(true);
    expect(again.token).not.toBe(session.paired.token);
    expect(session.closed()).toBe(true);
    await expect(fetchPage(session.paired.url, { ca: session.ca })).rejects.toMatchObject({ code: 'ECONNREFUSED' });
    expect(await fetchPage(again.url, { ca: again.cert })).toBe(200);
  });
});
