import { createHash } from 'node:crypto';
import { publicFetch, readCapped } from '../publicFetch.mjs';

const RELEASE = 'https://github.com/JamelHammoud/basecase/releases/latest/download/';
const MAX_BINARY_BYTES = 128 * 1024 * 1024;

export async function downloadRobotDaemon(arch, fetchFn = publicFetch) {
  if (!['x64', 'arm64'].includes(arch)) throw new Error('Choose an x64 or arm64 Linux computer.');

  const name = `robot-daemon-linux-${arch}`;
  const checksumResponse = await fetchFn(`${RELEASE}${name}.sha256`);

  if (!checksumResponse.ok) throw new Error('Couldn’t download the robot daemon checksum.');

  const checksum = (await readCapped(checksumResponse, 1024, 'The checksum')).toString('utf8');
  const expected = checksum.trim().split('  ');
  const hashText = expected[0];

  if (expected.length !== 2 || expected[1] !== name || !/^[a-f0-9]{64}$/.test(hashText))
    throw new Error('The robot daemon checksum has the wrong format.');

  const response = await fetchFn(`${RELEASE}${name}`);

  if (!response.ok) throw new Error('Couldn’t download the robot daemon.');

  const bytes = await readCapped(response, MAX_BINARY_BYTES, 'The robot daemon');
  const hash = createHash('sha256').update(bytes).digest('hex');
  const machine = arch === 'arm64' ? 183 : 62;
  const elf =
    bytes.length >= 20 &&
    bytes.subarray(0, 4).equals(Buffer.from([127, 69, 76, 70])) &&
    bytes[4] === 2 &&
    bytes[5] === 1;

  if (hash !== hashText || !elf || bytes.readUInt16LE(18) !== machine)
    throw new Error('The robot daemon download failed verification.');

  return bytes;
}
