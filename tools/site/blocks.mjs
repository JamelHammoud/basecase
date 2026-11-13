const FENCE = /^\s*(```|~~~)/;
const HEADING = /^#{1,6}\s+(.*)$/;
const ITEM = /^\s*(?:\d+\.|[-*+])\s+(.*)$/;
const IMAGE_LINE = /^\s*!\[[^\]]*\]\([^)]*\)\s*$/;
const TABLE_LINE = /^\s*\|/;

export const IMAGE = /!\[([^\]]*)\]\(([^)\s]+)[^)]*\)/g;
export const LINK = /(?<!!)\[([^\]]*)\]\(([^)\s]+)[^)]*\)/g;

export function splitSource(source) {
  const lines = source.replace(/\r\n/g, '\n').split('\n');
  const end = lines[0] === '---' ? lines.indexOf('---', 1) : -1;
  const start = end < 0 ? 0 : end + 1;

  return { lines: lines.slice(start), offset: start };
}

function kindOf(line) {
  if (HEADING.test(line)) return 'heading';

  if (IMAGE_LINE.test(line)) return 'image';

  if (TABLE_LINE.test(line)) return 'table';

  if (ITEM.test(line)) return 'item';

  return 'text';
}

const contentOf = (kind, line) => {
  if (kind === 'heading') return HEADING.exec(line)[1];

  if (kind === 'item') return ITEM.exec(line)[1];

  return line.trim();
};

const STANDALONE = new Set(['heading', 'image', 'table']);

export function blocksOf(source) {
  const { lines, offset } = splitSource(source);
  const blocks = [];
  let open = null;
  let fenced = false;

  lines.forEach((line, index) => {
    if (FENCE.test(line)) fenced = !fenced;

    const kind = fenced || FENCE.test(line) ? 'code' : kindOf(line);
    const continues = open && kind === 'text' && line.trim() !== '' && !STANDALONE.has(open.kind);

    if (continues) {
      open.text += ` ${line.trim()}`;

      return;
    }

    open = null;

    if (line.trim() === '' || kind === 'code') return;

    open = { kind: kind === 'text' ? 'paragraph' : kind, text: contentOf(kind, line), line: index + offset + 1 };
    blocks.push(open);
  });

  return blocks;
}

export const plainText = (text) =>
  text
    .replace(IMAGE, '')
    .replace(LINK, '$1')
    .replace(/`[^`]*`/g, 'code')
    .replace(/\*+/g, '')
    .replace(/\s+/g, ' ')
    .trim();

export const sentencesOf = (text) =>
  plainText(text)
    .split(/(?<=[.!?…])\s+(?=\S)/)
    .filter((sentence) => /[\p{L}\p{N}]/u.test(sentence));

export const wordCount = (sentence) => sentence.split(/\s+/).filter((word) => /[\p{L}\p{N}]/u.test(word)).length;

export const prose = (blocks) => blocks.filter((block) => block.kind === 'paragraph' || block.kind === 'item');
