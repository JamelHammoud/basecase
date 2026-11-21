import http from 'node:http';
import { authRequest, escapeXml, responseXml } from './samlFixture.mjs';

const config = JSON.parse(process.env.FLEET_TEST_IDP);
const server = http.createServer((request, response) => {
  try {
    const url = new URL(request.url, config.issuer);
    const auth = authRequest(url);
    const xml = responseXml({ ...auth, issuer: config.issuer, key: config.key });
    const encoded = Buffer.from(xml).toString('base64');

    response.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'no-store' });
    response.end(
      `<form method="post" action="${escapeXml(auth.callback)}"><input name="SAMLResponse" value="${encoded}"><input name="RelayState" value="${escapeXml(auth.relay)}"></form><script>document.forms[0].submit()</script>`,
    );
  } catch {
    response.writeHead(400);
    response.end();
  }
});

server.listen(config.port, config.host, () => process.stdout.write('FLEET_IDP_READY\n'));

process.on('message', (message) => {
  if (message !== 'stop') return;

  server.closeAllConnections();
  server.close(() => process.disconnect());
});
