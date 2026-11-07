import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createJiti } from 'jiti';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = path.join(ROOT, 'public', 'gallery');
const jiti = createJiti(import.meta.url);
const { galleryBundles, galleryIndex } = await jiti.import(path.join(ROOT, 'src/gallery/galleryEntries.ts'));

fs.mkdirSync(OUT, { recursive: true });

for (const bundle of galleryBundles()) {
  fs.writeFileSync(path.join(OUT, `${bundle.slug}.json`), `${JSON.stringify(bundle)}\n`);
}

fs.writeFileSync(path.join(OUT, 'index.json'), `${JSON.stringify(galleryIndex(), null, 2)}\n`);
console.log(`Wrote ${galleryBundles().length} gallery Cases to public/gallery.`);
