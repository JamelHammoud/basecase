import { describe, expect, it } from 'vitest';
import { CONTENT_FILES } from './contentFiles';
import { parseFrontMatter } from './frontMatter';
import { readContent } from './siteContent';
import { typesetMarkdown } from './typeset';

const NOW = new Date('2030-01-01');
const article = (fields: string, body = 'A task.') =>
  `---\ntitle: A task\ndate: 2026-11-01\ncollection: design\ntype: task\n${fields}\n---\n\n${body}`;
const files = {
  '/site/content/help/hub.md': article('hub_sort: order', 'Start.\n\n{{help-hub}}\n\nEnd.'),
  '/site/content/help/z.md': article('hub_hub_order: 1\nhub_hub: |\n  - First.\n\n  More detail.').replace(
    'title: A task',
    'title: Z task',
  ),
  '/site/content/help/a.md': article('hub_hub_order: 2\nhub_hub: |\n  - Second.'),
  '/site/content/help/draft.md': article('draft: true\nhub_hub: Hidden.'),
  '/site/content/help/future.md': article('hub_hub: Future.').replace('date: 2026-11-01', 'date: 2031-01-01'),
};

const bodyOf = (sources: Record<string, string>) =>
  readContent(sources, NOW).help.articles.find((a) => a.slug === 'hub')!.body;

describe('help hubs', () => {
  it('reads multiline Markdown without treating its lists or headings as frontmatter fields', () => {
    const source = article(
      'covers:\n  - src/a.ts\n\n  - src/b.ts\nhub_hub: |\n  ## Details\n\n  - Use **Parts**.\n\n  A second paragraph.',
    );
    const { data, body } = parseFrontMatter(source.replaceAll('\n', '\r\n'), '/site/content/help/a.md');

    expect(data.covers).toEqual(['src/a.ts', 'src/b.ts']);
    expect(data.hub_hub).toBe('## Details\n\n- Use **Parts**.\n\nA second paragraph.');
    expect(body).toBe('A task.');
  });

  it('renders only published contributors, in the order the hub selects', () => {
    expect(bodyOf(files)).toBe('Start.\n\n- First.\n\nMore detail.\n\n- Second.\n\nEnd.');
    expect(bodyOf({ ...files, '/site/content/help/hub.md': article('hub_sort: title', '{{help-hub}}') })).toContain(
      '- Second.\n\n- First.',
    );
    expect(bodyOf({ ...files, '/site/content/help/z.md': article('') })).not.toContain('First.');
  });

  it('rejects missing hubs, missing or repeated blocks, and unsupported sort rules with their paths', () => {
    expect(() => readContent({ '/site/content/help/a.md': files['/site/content/help/a.md'] }, NOW)).toThrow(
      /a.md.*hub/,
    );
    expect(() => bodyOf({ ...files, '/site/content/help/hub.md': article('hub_sort: order') })).toThrow(
      /hub.md.*block/,
    );
    expect(() =>
      bodyOf({ ...files, '/site/content/help/hub.md': article('hub_sort: order', '{{help-hub}}\n\n{{help-hub}}') }),
    ).toThrow(/hub.md.*block/);
    expect(() =>
      bodyOf({ ...files, '/site/content/help/hub.md': article('hub_sort: random', '{{help-hub}}') }),
    ).toThrow(/hub.md.*hub_sort/);
  });

  it('expands every committed hub from exactly its contributors in its selected order', () => {
    const center = readContent(CONTENT_FILES, NOW).help;
    const hubs = Object.entries(CONTENT_FILES).filter(([, source]) => source.includes('{{help-hub}}'));

    expect(hubs).toHaveLength(5);

    for (const [path, source] of hubs) {
      const slug = path.split('/').at(-1)!.slice(0, -3);
      const key = `hub_${slug.replaceAll('-', '_')}`;
      const contributors = Object.values(CONTENT_FILES)
        .map((value) => parseFrontMatter(value, 'fixture.md').data)
        .filter((data) => typeof data[key] === 'string' && data.draft !== true)
        .sort(
          (a, b) =>
            Number(a[`${key}_order`] ?? 1000) - Number(b[`${key}_order`] ?? 1000) ||
            String(a.title).localeCompare(String(b.title)),
        );
      const body = center.articles.find((a) => a.slug === slug)!.body;
      const expected = contributors.map((data) => data[key]).join('\n\n');
      const written = parseFrontMatter(source, path).body.replace('{{help-hub}}', expected);

      expect(body, slug).not.toContain('{{help-hub}}');
      expect(contributors.length, slug).toBeGreaterThan(0);
      expect(body, slug).toBe(typesetMarkdown(written));
    }
  });

  it('uses supplied git dates for help metadata and falls back to the publication date', () => {
    const content = readContent(files, NOW, { 'site/content/help/hub.md': '2026-11-10' });

    expect(content.help.articles.find((a) => a.slug === 'hub')!.updated).toBe('2026-11-10');
    expect(content.help.articles.find((a) => a.slug === 'a')!.updated).toBe('2026-11-01');
  });
});
