import { list, name, refuseImage, safeImagePath } from './sourceFiles';

function scalar(text: string): string {
  const trimmed = text.trim();
  const quoted = /^["']/.test(trimmed);

  if (quoted && trimmed.at(-1) !== trimmed[0]) refuseImage();

  return quoted ? trimmed.slice(1, -1) : trimmed;
}

function inlineNames(value: string): string[] {
  const content = value.trim();

  if (content.startsWith('[') && content.endsWith(']'))
    return content
      .slice(1, -1)
      .split(',')
      .filter((v) => v.trim())
      .map((v) => name(scalar(v)));

  if (content.startsWith('{') && content.endsWith('}')) return indexedNames(content.slice(1, -1).split(','));

  return refuseImage();
}

function indexedNames(lines: string[]): string[] {
  if (lines.every((line) => /^\s*-\s/.test(line)))
    return lines.map((line) => name(scalar(line.replace(/^\s*-\s*/, ''))));

  const entries = lines
    .map((line) => {
      const match = /^\s*(\d+)\s*:\s*(.+?)\s*$/.exec(line) ?? refuseImage();

      return { index: Number(match[1]), name: name(scalar(match[2])) };
    })
    .sort((a, b) => a.index - b.index);

  if (entries.some((entry, i) => entry.index !== i)) refuseImage();

  return entries.map((entry) => entry.name);
}

export interface YoloDescription {
  names: string[];
  keypointShape: [number, number] | null;
  task: string;
  paths: Record<string, string>;
}

function yamlEntries(text: string) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+#.*$/, ''))
    .filter((line) => line.trim() && !/^\s*#/.test(line));
  const entries = new Map<string, string>();
  const block: string[] = [];
  let inNames = false;

  for (const line of lines) {
    if (/^\s/.test(line) && inNames) {
      block.push(line);

      continue;
    }

    if (/^\s/.test(line)) continue;

    const match = /^([a-zA-Z_]+):\s*(.*?)\s*$/.exec(line) ?? refuseImage();

    if (entries.has(match[1])) refuseImage();

    entries.set(match[1], match[2]);
    inNames = match[1] === 'names' && !match[2];
  }

  return { entries, block };
}

function shapeOf(value: string | undefined): [number, number] | null {
  if (!value) return null;

  const shape = list(JSON.parse(value), 2).map(Number);

  if (shape.length !== 2 || !Number.isInteger(shape[0]) || shape[0] < 1 || shape[0] > 256 || ![2, 3].includes(shape[1]))
    refuseImage();

  return [shape[0], shape[1]];
}

function pathsOf(entries: Map<string, string>): Record<string, string> {
  const paths: Record<string, string> = {};

  for (const key of ['path', 'train', 'val', 'test']) {
    const value = scalar(entries.get(key) ?? '')
      .replace(/^\.\//, '')
      .replace(/\/$/, '');

    if (value && value !== '.') paths[key] = safeImagePath(value);
  }

  return paths;
}

export function readYoloYaml(text: string): YoloDescription {
  const { entries, block } = yamlEntries(text);
  const names = block.length ? indexedNames(block) : inlineNames(entries.get('names') ?? '');

  if (!names.length || names.length > 1000) refuseImage();

  return {
    names,
    keypointShape: shapeOf(entries.get('kpt_shape')),
    task: scalar(entries.get('task') ?? ''),
    paths: pathsOf(entries),
  };
}
