import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const { GROUPS } = await import(pathToFileURL(path.resolve('tools/icons/library.mjs')).href);
const outDir = path.resolve('src/design-system/glyphs');
const q = (v) => `'${v}'`;
const lit = (spec) => {
  if (typeof spec === 'string') return q(spec);

  const keys = Object.entries(spec).map(([k, v]) => `${k}: ${typeof v === 'string' ? q(v) : v}`);

  return `{ ${keys.join(', ')} }`;
};

fs.mkdirSync(outDir, { recursive: true });

for (const [group, icons] of Object.entries(GROUPS)) {
  const body = Object.entries(icons)
    .map(([name, spec]) => `export const ${name} = glyph(${lit(spec)});`)
    .join('\n\n');

  fs.writeFileSync(path.join(outDir, `${group}.ts`), `import { glyph } from '../glyph';\n\n${body}\n`);
}

fs.writeFileSync(
  path.join(outDir, 'index.ts'),
  Object.keys(GROUPS)
    .map((g) => `export * from './${g}';`)
    .join('\n') + '\n',
);
console.log(
  'wrote',
  Object.values(GROUPS).reduce((n, g) => n + Object.keys(g).length, 0),
  'glyphs',
);
