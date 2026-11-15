export type FrontMatterValue = string | boolean | string[];

export interface FrontMatter {
  data: Record<string, FrontMatterValue>;
  body: string;
}

const FENCE = '---';
const KEY_LINE = /^([a-z][a-z0-9_]*):\s*(.*)$/i;
const LIST_ITEM = /^\s*-\s+(.+)$/;

const unquote = (value: string) => value.replace(/^(['"])(.*)\1$/, '$2');

function scalar(raw: string): FrontMatterValue {
  const value = unquote(raw);

  if (value === 'true') return true;

  if (value === 'false') return false;

  return value;
}

function continuation(lines: string[], start: number, literal: boolean) {
  let end = start;

  while (
    end < lines.length &&
    (!lines[end].trim() || (literal ? lines[end].startsWith('  ') : LIST_ITEM.test(lines[end])))
  ) {
    end += 1;
  }

  const values = lines.slice(start, end);
  const value = literal
    ? values
        .map((line) => line.slice(2))
        .join('\n')
        .trimEnd()
    : values.filter((line) => line.trim()).map((line) => unquote(LIST_ITEM.exec(line)![1].trim()));

  return { value, end };
}

function parseLines(lines: string[], path: string): Record<string, FrontMatterValue> {
  const data: Record<string, FrontMatterValue> = {};
  let index = 0;

  while (index < lines.length) {
    const line = lines[index++];

    if (!line.trim()) continue;

    const pair = KEY_LINE.exec(line);

    if (!pair) throw new Error(`${path}: can't read front matter line "${line}"`);

    const [, key, raw] = pair;
    const value = raw.trim();

    if (value !== '' && value !== '|') {
      data[key] = scalar(value);

      continue;
    }

    const block = continuation(lines, index, value === '|');

    data[key] = block.value;
    index = block.end;
  }

  return data;
}

export function parseFrontMatter(source: string, path: string): FrontMatter {
  const lines = source.replace(/\r\n/g, '\n').split('\n');

  if (lines[0] !== FENCE) throw new Error(`${path}: start the file with front matter between --- lines`);

  const end = lines.indexOf(FENCE, 1);

  if (end < 0) throw new Error(`${path}: close the front matter with a --- line`);

  const fields = lines.slice(1, end);
  const data = parseLines(fields, path);

  if (/(?:^|\/)help\//.test(path) && Object.hasOwn(data, 'updated')) {
    throw new Error(`${path}: remove "updated:", help dates come from git`);
  }

  return {
    data,
    body: lines
      .slice(end + 1)
      .join('\n')
      .trim(),
  };
}
