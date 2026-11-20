import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { imageProblem, siteImageProblems } from './imageHealth.mjs';

let directory;

beforeEach(async () => {
  directory = await mkdtemp(path.join(os.tmpdir(), 'basecase-site-images-'));
});

afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

const loader = (color) =>
  Buffer.from(
    `<svg width="1440" height="900"><rect width="1440" height="900" fill="#121212"/><rect x="688" y="418" width="64" height="64" rx="16" fill="${color}"/><rect x="704" y="434" width="32" height="32" rx="8" fill="#121212"/></svg>`,
  );

const article = Buffer.from(
  '<svg width="1440" height="900"><rect width="1440" height="900" fill="#121212"/><rect x="100" y="50" width="1240" height="800" rx="12" fill="#242424"/><text x="200" y="200" fill="white" font-size="32">Export Kit</text></svg>',
);

describe('article image health', () => {
  it.each(['png', 'jpeg', 'webp'])('rejects a startup capture encoded as %s', async (format) => {
    const image = await sharp(loader('#dddddd')).toFormat(format).toBuffer();

    expect(await imageProblem(image)).toBe('shows the Basecase loading screen');
  });

  it('rejects a dim startup animation, blank captures and HTML returned for a missing image', async () => {
    expect(await imageProblem(await sharp(loader('#444444')).png().toBuffer())).toContain('loading screen');
    expect(
      await imageProblem(
        await sharp({ create: { width: 500, height: 300, channels: 3, background: '#121212' } })
          .png()
          .toBuffer(),
      ),
    ).toBe('is blank');
    expect(await imageProblem(Buffer.from('<html class="booting">Basecase</html>'))).toBe(
      'cannot be decoded as an image',
    );
  });

  it('accepts a dark page with visible content', async () => {
    expect(await imageProblem(await sharp(article).png().toBuffer())).toBeNull();
  });

  it('checks nested help, blog and changelog assets with actionable paths', async () => {
    for (const section of ['help', 'blog', 'changelog']) {
      const folder = path.join(directory, section, 'export');

      await mkdir(folder, { recursive: true });
      await writeFile(path.join(folder, 'cover.png'), await sharp(loader('#dddddd')).png().toBuffer());
      await writeFile(path.join(folder, 'menu.webp'), await sharp(article).webp().toBuffer());
    }

    expect(await siteImageProblems(directory)).toEqual(
      ['blog', 'changelog', 'help'].map(
        (section) => `${path.join(section, 'export', 'cover.png')}: shows the Basecase loading screen`,
      ),
    );
  });
});
