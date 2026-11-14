import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { downloadRobotDaemon } from './robotInstallDownload.mjs';

function elf(arch) {
  const bytes = Buffer.alloc(64);

  bytes.set([127, 69, 76, 70, 2, 1]);
  bytes.writeUInt16LE(arch === 'arm64' ? 183 : 62, 18);

  return bytes;
}

function source(arch, { binary = elf(arch), checksum = binary, named = arch } = {}) {
  const hash = createHash('sha256').update(checksum).digest('hex');

  return vi.fn(
    async (url) => new Response(url.endsWith('.sha256') ? `${hash}  robot-daemon-linux-${named}\n` : binary),
  );
}

describe('robot daemon download', () => {
  it.each(['arm64', 'x64'])('verifies a sha256sum release checksum and the %s ELF machine', async (arch) => {
    const fetch = source(arch);

    expect(await downloadRobotDaemon(arch, fetch)).toEqual(elf(arch));
    expect(fetch.mock.calls.map(([url]) => url)).toEqual([
      `https://github.com/JamelHammoud/basecase/releases/latest/download/robot-daemon-linux-${arch}.sha256`,
      `https://github.com/JamelHammoud/basecase/releases/latest/download/robot-daemon-linux-${arch}`,
    ]);
  });

  it('refuses checksum tampering, the wrong architecture, a non-ELF file and a mismatched checksum filename', async () => {
    for (const overrides of [
      { checksum: Buffer.from('tampered') },
      { binary: elf('x64') },
      { binary: Buffer.from('not an executable') },
      { named: 'x64' },
    ]) {
      await expect(downloadRobotDaemon('arm64', source('arm64', overrides))).rejects.toThrow(/verification|format/);
    }
  });

  it('refuses oversized responses before collecting their bodies and failed release responses', async () => {
    const tooLarge = async () => new Response('', { headers: { 'content-length': '2000' } });

    await expect(downloadRobotDaemon('arm64', tooLarge)).rejects.toThrow('larger');
    await expect(downloadRobotDaemon('arm64', async () => new Response('', { status: 404 }))).rejects.toThrow(
      'checksum',
    );
  });
});
