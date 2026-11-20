import { readdir } from 'node:fs/promises';
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
    let minimum = 255;
    let maximum = 0;

    for (let i = 0; i < data.length; i += info.channels) {
      const values = [data[i], data[i + 1], data[i + 2]];

      if (values.every((value) => Math.abs(value - 18) <= 3)) dark++;

      minimum = Math.min(minimum, ...values);
      maximum = Math.max(maximum, ...values);
    }

    if (maximum - minimum <= 4) return 'is blank';

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
    const problem = await imageProblem(path.join(publicDir, file));

    if (problem) problems.push(`${file}: ${problem}`);
  }

  return problems;
}
