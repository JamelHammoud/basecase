import { once } from 'node:events';
import { createServer } from 'node:net';
import type { Browser } from 'playwright-core';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { CODE_PANEL_SANDBOX, codePanelDocument } from '../src/cases/console/codeDocument';
import { launchChrome } from './harness';

let browser: Browser;

beforeAll(async () => {
  browser = await launchChrome();
});

afterAll(async () => {
  await browser?.close();
});

it.each([true, false])(
  'blocks panel WebRTC and TURN traffic with the WebRTC CSP directive enabled: %s',
  async (csp) => {
    let connections = 0;
    const server = createServer((socket) => {
      connections++;
      socket.destroy();
    });

    server.listen(0, '127.0.0.1');
    await once(server, 'listening');

    const address = server.address();

    if (!address || typeof address === 'string') throw new Error('Missing TURN listener address');

    const url = `turn:127.0.0.1:${address.port}?transport=tcp`;
    const page = await browser.newPage();

    try {
      await page.goto('about:blank');
      await page.evaluate(async (urls) => {
        const peer = new RTCPeerConnection({
          iceServers: [{ urls, username: 'probe', credential: 'probe' }],
          iceTransportPolicy: 'relay',
        });

        Reflect.set(window, 'probePeer', peer);
        peer.createDataChannel('probe');
        await peer.setLocalDescription(await peer.createOffer());
      }, url);
      await expect.poll(() => connections).toBeGreaterThan(0);
      await page.evaluate(() => Reflect.get(window, 'probePeer').close());

      const controlConnections = connections;
      const source = codePanelDocument(`<script>
      const results = {};
      for (const name of ['RTCPeerConnection', 'webkitRTCPeerConnection']) {
        try {
          const peer = new window[name]({
            iceServers: [{ urls: '${url}', username: 'probe', credential: 'probe' }],
            iceTransportPolicy: 'relay'
          });
          peer.createDataChannel('escape');
          peer.createOffer().then(offer => peer.setLocalDescription(offer));
          results[name] = 'allowed';
        } catch (error) { results[name] = error.name; }
        const descriptor = Object.getOwnPropertyDescriptor(window, name);
        results[name + 'Locked'] = descriptor?.value === undefined &&
          descriptor?.writable === false && descriptor?.configurable === false;
      }
      parent.postMessage({ probe: 'webrtc', results }, '*');
    </script>`);

      await page.evaluate(
        ({ sandbox, document }) => {
          const frame = window.document.createElement('iframe');

          addEventListener('message', (event) => {
            if (event.source !== frame.contentWindow || event.data?.probe !== 'webrtc') return;

            window.document.body.dataset.results = JSON.stringify(event.data.results);
          });
          frame.setAttribute('sandbox', sandbox);
          frame.srcdoc = document;
          window.document.body.append(frame);
        },
        { sandbox: CODE_PANEL_SANDBOX, document: csp ? source : source.replace("webrtc 'block'; ", '') },
      );
      await expect
        .poll(() =>
          page
            .locator('body')
            .getAttribute('data-results')
            .then((value) => JSON.parse(value ?? '{}')),
        )
        .toEqual({
          RTCPeerConnection: 'TypeError',
          RTCPeerConnectionLocked: true,
          webkitRTCPeerConnection: 'TypeError',
          webkitRTCPeerConnectionLocked: true,
        });
      expect(connections).toBe(controlConnections);
    } finally {
      await page.close();
      await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    }
  },
);
