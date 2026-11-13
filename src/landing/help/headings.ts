export interface Heading {
  id: string;
  text: string;
}

const FENCE = /^\s*(```|~~~)/;
const SECOND_LEVEL = /^##\s+(.+?)\s*#*\s*$/;

export const inlineText = (markdown: string) =>
  markdown
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[\[([^[\]]+)\]\]/g, '$1')
    .replace(/[*`]|\b_+|_+\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();

export const slugify = (text: string) =>
  text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/[\s-]+/g, '-');

export function headingSlugger() {
  const seen = new Map<string, number>();

  return (text: string) => {
    const base = slugify(text) || 'section';
    const count = (seen.get(base) ?? 0) + 1;

    seen.set(base, count);

    return count === 1 ? base : `${base}-${count}`;
  };
}

export function extractHeadings(markdown: string): Heading[] {
  const slug = headingSlugger();
  const headings: Heading[] = [];
  let fenced = false;

  for (const line of markdown.split('\n')) {
    fenced = FENCE.test(line) ? !fenced : fenced;

    const match = fenced ? null : SECOND_LEVEL.exec(line);

    if (match) {
      const text = inlineText(match[1]);

      headings.push({ id: slug(text), text });
    }
  }

  return headings;
}
