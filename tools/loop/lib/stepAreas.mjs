const BACKTICKED = /`([^`\n]+)`/g;
const SECTION = /§\s?(\d+[a-z]?)/g;
const EXTENSIONS = 'md|mjs|cjs|js|jsx|ts|tsx|json|py|css|html|yml|yaml|toml|swift|c|h|cpp|rs|glb|wasm|svg|png|sh|xml';
const FILE = new RegExp(`^(?:[\\w.-][\\w.@-]*/)*[\\w-][\\w.@-]*\\.(?:${EXTENSIONS})$`);
const FOLDER = /^[\w.-][\w.@-]*\/(?:[\w.@-]+\/)*[\w.@-]+\/?$/;
const CONTAINERS = new Set([
  'src/app',
  'src/components',
  'src/data',
  'src/design-system',
  'src/three',
  'src/types',
  'src/utils',
  'src/workspace',
  'electron/backend',
  'electron/cad-mcp',
]);
const SHARED = [
  /(^|\/)AGENTS\.md$/,
  /^docs\/guide\//,
  /^docs\/notes\//,
  /^site\/content\/help\//,
  /^site\/public\/help\//,
];

const cleanPath = (token) =>
  token
    .trim()
    .replace(/^\.\//, '')
    .replace(/(:\d+)+$/, '')
    .replace(/#.*$/, '');

const isPath = (token) => FILE.test(token) || (FOLDER.test(token) && !CONTAINERS.has(token.replace(/\/$/, '')));

const unique = (items) => [...new Set(items)];

export function namedAreas(body) {
  const text = String(body ?? '');
  const files = [...text.matchAll(BACKTICKED)].map((match) => cleanPath(match[1])).filter(isPath);
  const sections = [...text.matchAll(SECTION)].map((match) => `§${match[1]}`);

  return { files: unique(files), sections: unique(sections) };
}

export const stepAreas = (step) => ({ number: step.number, title: step.title, ...namedAreas(step.body) });

export const isShared = (file) => SHARED.some((pattern) => pattern.test(file));

export function names(name, file) {
  if (name.endsWith('/')) return file.startsWith(name) || file.includes(`/${name}`);

  return file === name || file.endsWith(`/${name}`) || file.startsWith(`${name}/`);
}

const ownerOf = (file, steps) => {
  const naming = steps.filter((step) => step.files.some((name) => names(name, file)));

  return naming.length === 1 ? naming[0] : null;
};

export function heldBy(files, steps) {
  const owners = files.filter((file) => !isShared(file)).map((file) => ownerOf(file, steps));
  const [first] = owners;

  return first && owners.every((owner) => owner === first) ? first : null;
}

const areaLine = ({ files, sections }) =>
  [
    files.length > 0 ? `files ${files.map((file) => `\`${file}\``).join(', ')}` : '',
    sections.length > 0 ? `sections ${sections.join(', ')}` : '',
  ]
    .filter(Boolean)
    .join('; ');

export function stepAreasText(steps) {
  if (steps.length === 0) return '(none)';

  return steps
    .map((step) => {
      const areas = areaLine(step);

      return areas ? `- #${step.number} ${step.title}\n  ${areas}` : `- #${step.number} ${step.title}`;
    })
    .join('\n');
}
