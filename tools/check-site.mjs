import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { formatProblem, lintSite } from './site/lint.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONTENT = 'site/content';
const PUBLIC = path.join(root, 'site/public');

function contentFiles() {
  return fs
    .readdirSync(path.join(root, CONTENT), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap((dir) =>
      fs
        .readdirSync(path.join(root, CONTENT, dir.name))
        .filter((name) => name.endsWith('.md'))
        .map((name) => `${CONTENT}/${dir.name}/${name}`),
    );
}

const exists = (publicPath) => fs.existsSync(path.join(PUBLIC, decodeURIComponent(publicPath.split(/[?#]/)[0])));

const files = contentFiles().map((file) => ({ path: file, source: fs.readFileSync(path.join(root, file), 'utf8') }));
const problems = lintSite({ files, exists });

if (problems.length > 0) {
  console.error('Site copy breaks the writing rules (docs/guide/copy.md, §3f):');
  problems.forEach((found) => console.error(`  ${formatProblem(found)}`));
  process.exit(1);
}

console.log(`Site copy: ${files.length} pages pass §3f.`);
