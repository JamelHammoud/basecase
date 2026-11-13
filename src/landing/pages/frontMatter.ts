export type FrontMatterValue = string | boolean | string[];

export interface FrontMatter {
  data: Record<string, FrontMatterValue>;
  body: string;
}

const FENCE = '---';
const KEY_LINE = /^([a-z][a-z0-9_]*):\s*(.*)$/i;
const LIST_ITEM = /^\s+-\s+(.+)$/;

const unquote = (value: string) => value.replace(/^(['"])(.*)\1$/, '$2');

function scalar(raw: string): FrontMatterValue {
  if (raw === 'true') return true;

  if (raw === 'false') return false;

  return unquote(raw);
}

function parseLines(lines: string[], path: string): Record<string, FrontMatterValue> {
  const data: Record<string, FrontMatterValue> = {};
  let listKey: string | null = null;

  for (const line of lines) {
    const item = LIST_ITEM.exec(line);
    const list = listKey ? data[listKey] : null;

    if (item && Array.isArray(list)) {
      list.push(unquote(item[1].trim()));

      continue;
    }

    const pair = KEY_LINE.exec(line);

    if (!pair) throw new Error(`${path}: can't read front matter line "${line}"`);

    const [, key, raw] = pair;

    listKey = raw.trim() === '' ? key : null;
    data[key] = listKey ? [] : scalar(raw.trim());
  }

  return data;
}

export function parseFrontMatter(source: string, path: string): FrontMatter {
  const lines = source.replace(/\r\n/g, '\n').split('\n');

  if (lines[0] !== FENCE) throw new Error(`${path}: start the file with front matter between --- lines`);

  const end = lines.indexOf(FENCE, 1);

  if (end < 0) throw new Error(`${path}: close the front matter with a --- line`);

  const fields = lines.slice(1, end).filter((line) => line.trim() !== '');

  return {
    data: parseLines(fields, path),
    body: lines
      .slice(end + 1)
      .join('\n')
      .trim(),
  };
}
