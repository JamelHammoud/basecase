import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { appLabels } from './copy/appLabels.mjs';
import { formatProblem, lintSite } from './site/lint.mjs';
import { siteImageProblems } from './site/imageHealth.mjs';
import { headerProblems } from './site/headers.mjs';

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

function builtHeaderProblems() {
  if (!process.argv.includes('--built-dir')) return [];

  const directory = process.argv[process.argv.indexOf('--built-dir') + 1];

  if (!directory) throw new Error('--built-dir requires the site build directory');

  return headerProblems(fs.readFileSync(path.resolve(directory, '_headers'), 'utf8'), { full: true });
}

const files = contentFiles().map((file) => ({ path: file, source: fs.readFileSync(path.join(root, file), 'utf8') }));
const problems = lintSite({ files, exists, labels: appLabels(root) }).map(formatProblem);

problems.push(...(await siteImageProblems(PUBLIC)));
problems.push(...builtHeaderProblems());

if (problems.length > 0) {
  console.error('Site content breaks the publishing rules (docs/guide/copy.md, §3f):');
  problems.forEach((found) => console.error(`  ${found}`));
  process.exit(1);
}

console.log(`Site copy: ${files.length} pages pass §3f.`);
