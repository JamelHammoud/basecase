import crypto from 'node:crypto';
import https from 'node:https';
import { describe, expect, it } from 'vitest';
import { selfSignedCert } from './selfSignedCert.mjs';

describe('selfSignedCert', () => {
  it('makes a P-256 certificate for the IP that verifies with its own key', () => {
    const now = Date.UTC(2026, 10, 13, 12);
    const { key, cert } = selfSignedCert('127.0.0.2', now);
    const x509 = new crypto.X509Certificate(cert);

    expect(x509.verify(crypto.createPublicKey(key))).toBe(true);
    expect(x509.subjectAltName).toBe('IP Address:127.0.0.2');
    expect(x509.subject).toBe('CN=Basecase');
    expect(x509.issuer).toBe('CN=Basecase');
    expect(x509.ca).toBe(false);
    expect(Date.parse(x509.validFrom)).toBe(now - 24 * 3600 * 1000);
    expect(Date.parse(x509.validTo)).toBe(now + 7 * 24 * 3600 * 1000);
    expect(x509.publicKey.asymmetricKeyDetails?.namedCurve).toBe('prime256v1');
  });

  it('makes a fresh key and serial each time', () => {
    const a = new crypto.X509Certificate(selfSignedCert('127.0.0.3').cert);
    const b = new crypto.X509Certificate(selfSignedCert('127.0.0.3').cert);

    expect(a.serialNumber).not.toBe(b.serialNumber);
    expect(a.fingerprint256).not.toBe(b.fingerprint256);
  });

  it('is accepted by an HTTPS server and trusted when pinned', async () => {
    const { key, cert } = selfSignedCert('127.0.0.1');
    const server = https.createServer({ key, cert }, (_req, res) => res.end('ok'));

    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

    const status = await new Promise((resolve, reject) => {
      https
        .get({ host: '127.0.0.1', port: server.address().port, ca: cert, agent: false }, (res) => {
          res.resume();
          resolve(res.statusCode);
        })
        .on('error', reject);
    });

    server.close();
    expect(status).toBe(200);
  });

  it('refuses anything but an IPv4 address', () => {
    expect(() => selfSignedCert('example.com')).toThrow();
  });
});
