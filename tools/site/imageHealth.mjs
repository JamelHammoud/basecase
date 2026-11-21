import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

export async function imageProblem(input) {
  try {
    const { data, info } = await sharp(input)
      .resize({ width: 360, height: 360, fit: 'inside', withoutEnlargement: true })
      .flatten({ background: '#121212' })
      .toColourspace('srgb')
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    let dark = 0;
    const minimum = [255, 255, 255];
    const maximum = [0, 0, 0];

    for (let i = 0; i < data.length; i += info.channels) {
      const values = [data[i], data[i + 1], data[i + 2]];

      if (values.every((value) => Math.abs(value - 18) <= 3)) dark++;

      for (let channel = 0; channel < 3; channel++) {
        minimum[channel] = Math.min(minimum[channel], values[channel]);
        maximum[channel] = Math.max(maximum[channel], values[channel]);
      }
    }

    if (maximum.every((value, channel) => value - minimum[channel] <= 4)) return 'is blank';

    if (dark / (info.width * info.height) > 0.98) return 'shows the Basecase loading screen';

    return null;
  } catch {
    return 'cannot be decoded as an image';
  }
}

export async function siteImageProblems(publicDir) {
  const entries = await readdir(publicDir, { recursive: true, withFileTypes: true });
  const images = entries
    .filter((entry) => entry.isFile() && /\.(png|jpe?g|webp|avif)$/i.test(entry.name))
    .map((entry) => path.relative(publicDir, path.join(entry.parentPath, entry.name)))
    .filter((file) => /^(?:help|blog|changelog)[/\\]/.test(file))
    .sort();
  const problems = [];

  for (const file of images) {
    const problem = await imageProblem(await readFile(path.join(publicDir, file)));

    if (problem) problems.push(`${file}: ${problem}`);
  }

  return problems;
}
