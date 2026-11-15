import crypto from 'node:crypto';

const production = (file) =>
  file === 'electron/cad-agent-prompt.mjs' ||
  file.startsWith('electron/cad-agent-guides/') ||
  file.startsWith('electron/cad-mcp/');
const testFile = (file) => /\.(?:test|e2e\.test)\.[cm]?[jt]sx?$/.test(file) && !file.startsWith('bench/');
const harnessFile = (file) => production(file) && !testFile(file);

export function proposalFiles(files) {
  const outside = files.filter((file) => !production(file) && !testFile(file) && !file.startsWith('docs/guide/'));

  if (outside.length) throw new Error(`Proposal changed files outside the harness: ${outside.join(', ')}`);

  const harness = files.filter(harnessFile).sort();

  if (!harness.length) throw new Error('Proposal needs a production harness change.');

  return harness;
}

export function proposalFingerprint({ patchId, added }) {
  if (!patchId && !added.length) throw new Error('The production harness patch is empty.');

  const files = added.toSorted((a, b) => a.file.localeCompare(b.file));

  return crypto.createHash('sha256').update(JSON.stringify({ patchId, files })).digest('hex');
}
