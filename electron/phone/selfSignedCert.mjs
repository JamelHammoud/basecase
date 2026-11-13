import crypto from 'node:crypto';
import net from 'node:net';

const DAY_MS = 24 * 60 * 60 * 1000;
const ECDSA_WITH_SHA256 = '1.2.840.10045.4.3.2';
const COMMON_NAME = '2.5.4.3';
const SUBJECT_ALT_NAME = '2.5.29.17';
const BASIC_CONSTRAINTS = '2.5.29.19';

function derLength(length) {
  if (length < 0x80) return Buffer.from([length]);

  const bytes = [];

  for (let rest = length; rest > 0; rest >>= 8) bytes.unshift(rest & 0xff);

  return Buffer.from([0x80 | bytes.length, ...bytes]);
}

const tlv = (tag, ...parts) => {
  const body = Buffer.concat(parts);

  return Buffer.concat([Buffer.from([tag]), derLength(body.length), body]);
};

const sequence = (...parts) => tlv(0x30, ...parts);

function oidBytes(dotted) {
  const [first, second, ...rest] = dotted.split('.').map(Number);
  const bytes = [first * 40 + second];

  for (const arc of rest) {
    const group = [arc & 0x7f];

    for (let value = arc >> 7; value > 0; value >>= 7) group.unshift((value & 0x7f) | 0x80);

    bytes.push(...group);
  }

  return tlv(0x06, Buffer.from(bytes));
}

function utcTime(date) {
  const two = (n) => String(n).padStart(2, '0');
  const text = [
    date.getUTCFullYear() % 100,
    date.getUTCMonth() + 1,
    date.getUTCDate(),
    date.getUTCHours(),
    date.getUTCMinutes(),
    date.getUTCSeconds(),
  ]
    .map(two)
    .join('');

  return tlv(0x17, Buffer.from(`${text}Z`, 'ascii'));
}

function serialNumber() {
  const bytes = crypto.randomBytes(16);

  bytes[0] = (bytes[0] & 0x7f) | 0x40;

  return tlv(0x02, bytes);
}

const name = (commonName) =>
  sequence(tlv(0x31, sequence(oidBytes(COMMON_NAME), tlv(0x0c, Buffer.from(commonName, 'utf8')))));

const extension = ({ oid, critical, value }) =>
  sequence(oidBytes(oid), ...(critical ? [tlv(0x01, Buffer.from([0xff]))] : []), tlv(0x04, value));

function ipv4Bytes(ip) {
  if (!net.isIPv4(ip)) throw new Error(`Not an IPv4 address: ${ip}`);

  return Buffer.from(ip.split('.').map(Number));
}

function tbsCertificate({ ip, spki, now }) {
  const algorithm = sequence(oidBytes(ECDSA_WITH_SHA256));
  const extensions = sequence(
    extension({ oid: SUBJECT_ALT_NAME, critical: false, value: sequence(tlv(0x87, ipv4Bytes(ip))) }),
    extension({ oid: BASIC_CONSTRAINTS, critical: true, value: sequence() }),
  );

  return sequence(
    tlv(0xa0, tlv(0x02, Buffer.from([2]))),
    serialNumber(),
    algorithm,
    name('Basecase'),
    sequence(utcTime(new Date(now - DAY_MS)), utcTime(new Date(now + 7 * DAY_MS))),
    name('Basecase'),
    spki,
    tlv(0xa3, extensions),
  );
}

const pem = (label, der) =>
  `-----BEGIN ${label}-----\n${der
    .toString('base64')
    .match(/.{1,64}/g)
    .join('\n')}\n-----END ${label}-----\n`;

export function selfSignedCert(ip, now = Date.now()) {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const tbs = tbsCertificate({ ip, spki: publicKey.export({ type: 'spki', format: 'der' }), now });
  const signature = crypto.sign('sha256', tbs, privateKey);
  const certificate = sequence(tbs, sequence(oidBytes(ECDSA_WITH_SHA256)), tlv(0x03, Buffer.from([0]), signature));

  return { key: privateKey.export({ type: 'pkcs8', format: 'pem' }), cert: pem('CERTIFICATE', certificate) };
}
