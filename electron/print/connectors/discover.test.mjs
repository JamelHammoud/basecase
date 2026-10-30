import { describe, expect, it } from 'vitest';
import { bambuFromSsdp, parseSsdp } from './discover.mjs';
import { hostWithPort, parseBrowseLine, parseResolveLine } from './dnssd.mjs';

const ip = (...parts) => parts.join('.');
const PRINTER = ip(192, 168, 1, 40);
const SENDER = ip(10, 0, 0, 9);
const ROUTER = ip(192, 168, 1, 1);

const NOTIFY = [
  'NOTIFY * HTTP/1.1',
  'HOST: 239.255.255.250:1990',
  'Server: UPnP/1.0',
  `Location: ${PRINTER}`,
  'NT: urn:bambulab-com:device:3dprinter:1',
  'USN: 01P00A123456789',
  'Cache-Control: max-age=1800',
  'DevModel.bambu.com: C12',
  'DevName.bambu.com: My P1S',
  'DevSignal.bambu.com: -45',
  'DevConnect.bambu.com: lan',
  'DevBind.bambu.com: free',
  '',
  '',
].join('\r\n');

describe('SSDP discovery', () => {
  it('parses a Bambu NOTIFY', () => {
    expect(parseSsdp(NOTIFY).startLine).toBe('NOTIFY * HTTP/1.1');
    expect(bambuFromSsdp(NOTIFY, SENDER)).toEqual({
      name: 'My P1S',
      host: PRINTER,
      kind: 'bambu-lan',
      serial: '01P00A123456789',
      modelId: 'bambu-lab-p1s',
      cloud: false,
    });
  });

  it('falls back to the sender address and flags cloud printers and unknown models', () => {
    const text = NOTIFY.replace(`Location: ${PRINTER}\r\n`, '')
      .replace('C12', 'X9')
      .replace('Connect.bambu.com: lan', 'Connect.bambu.com: cloud');

    expect(bambuFromSsdp(text, SENDER)).toMatchObject({ host: SENDER, modelId: null, cloud: true });
  });

  it('ignores other SSDP devices', () => {
    const router = `NOTIFY * HTTP/1.1\r\nNT: upnp:rootdevice\r\nUSN: uuid:abc\r\nLocation: http://${ROUTER}/x.xml\r\n`;

    expect(bambuFromSsdp(router, ROUTER)).toBeNull();
  });
});

describe('dns-sd discovery', () => {
  it('reads browse and resolve lines', () => {
    const add = '14:19:28.903  Add        3  14 local.               _octoprint._tcp.     OctoPrint instance on octopi';

    expect(parseBrowseLine(add)).toEqual({
      domain: 'local.',
      type: '_octoprint._tcp.',
      name: 'OctoPrint instance on octopi',
    });
    expect(parseBrowseLine('Timestamp     A/R    Flags  if Domain   Service Type   Instance Name')).toBeNull();

    const reached =
      '14:19:29.100  OctoPrint\\032instance._octoprint._tcp.local. can be reached at octopi.local.:80 (interface 14)';

    expect(parseResolveLine(reached)).toEqual({ host: 'octopi.local', port: 80 });
    expect(hostWithPort({ host: 'octopi.local', port: 80 })).toBe('octopi.local');
    expect(hostWithPort({ host: 'voron.local', port: 7125 })).toBe('voron.local:7125');
  });
});
