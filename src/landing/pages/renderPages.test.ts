import { describe, expect, it } from 'vitest';
import { CONTENT_FILES } from './contentFiles';
import { parseFrontMatter } from './frontMatter';
import { renderPages } from './renderPages';
import { readContent } from './siteContent';

const NOW = new Date('2026-11-12T12:00:00Z');

const post = (fields: string, body = 'One sentence about it.') => `---\n${fields}\n---\n\n${body}\n`;

const FIXTURES: Record<string, string> = {
  '/site/content/changelog/2026-11-01-older.md': post('title: Older\ndate: 2026-11-01\nversion: 0.1.1'),
  '/site/content/changelog/2026-11-02-newer.md': post('title: Newer & better\ndate: 2026-11-02\nversion: 0.1.2'),
  '/site/content/changelog/2026-11-03-hidden.md': post('title: Hidden entry\ndate: 2026-11-03\ndraft: true'),
  '/site/content/blog/launch.md': post('title: Launch\ndate: 2026-11-10\ndraft: false\nline: "Built on a Sunday."'),
  '/site/content/blog/unfinished.md': post('title: Unfinished\ndate: 2026-11-10\ndraft: true'),
  '/site/content/blog/tomorrow.md': post('title: Tomorrow\ndate: 2026-11-13'),
  '/site/content/help/import-a-mesh.md': post(
    'title: Import a mesh\ndate: 2026-11-12\ncovers:\n  - src/workspace/meshImport.ts\n  - src/workspace/usePartCreation.ts',
    'Bring a model in.\n\n1. Right-click the canvas.\n2. Choose **Import Mesh**.\n\n<script>alert(1)</script>\n\n[Mail](mailto:hi@example.com) [Source](https://github.com)',
  ),
};

const render = (files: Record<string, string>) => {
  const output = renderPages(readContent(files, NOW), ['/assets/index-abc.css']);

  return new Map(output.map(({ fileName, source }) => [fileName, source]));
};

describe('site pages', () => {
  const files = render(FIXTURES);

  it('writes every route, the feeds and the sitemap', () => {
    expect([...files.keys()].sort()).toEqual([
      'blog.html',
      'blog/launch.html',
      'changelog.html',
      'changelog.json',
      'changelog/rss.xml',
      'help.html',
      'help/import-a-mesh.html',
      'sitemap.xml',
    ]);
    expect(files.get('sitemap.xml')).toContain('<loc>https://basecase.so/help/import-a-mesh</loc>');
    expect(files.get('changelog.html')).toContain('<link rel="stylesheet" href="/assets/index-abc.css"/>');
  });

  it('leaves out drafts and posts dated in the future', () => {
    const everything = [...files.values()].join('\n');

    expect(everything).not.toContain('Hidden entry');
    expect(everything).not.toContain('Unfinished');
    expect(everything).not.toContain('Tomorrow');
    expect(files.get('blog.html')).toContain('Launch');
  });

  it('lists the changelog newest first in the page and both feeds', () => {
    const page = files.get('changelog.html')!;
    const feed = JSON.parse(files.get('changelog.json')!);
    const rss = files.get('changelog/rss.xml')!;

    expect(page.indexOf('Newer &amp; better')).toBeLessThan(page.indexOf('Older'));
    expect(feed.items.map((item: { title: string }) => item.title)).toEqual(['Newer & better', 'Older']);
    expect(feed.items[0]).toMatchObject({
      url: 'https://basecase.so/changelog#2026-11-02-newer',
      _basecase: { version: '0.1.2' },
    });
    expect(rss).toContain('<title>Newer &amp; better</title>');
    expect(rss.indexOf('Newer')).toBeLessThan(rss.indexOf('Older'));
  });

  it('renders markdown as elements and drops raw HTML', () => {
    const article = files.get('help/import-a-mesh.html')!;

    expect(article).toContain('<ol');
    expect(article).toContain('<strong class="font-semibold text-white/90">Import Mesh</strong>');
    expect(article).not.toContain('<script');
    expect(article).not.toContain('alert(1)');
    expect(article).toContain('<a href="mailto:hi@example.com" class=');
    expect(article).toContain('<a href="https://github.com" target="_blank"');
  });

  it('leaves the blog out until a post is published', () => {
    const withoutPosts = render({
      '/site/content/changelog/a.md': FIXTURES['/site/content/changelog/2026-11-01-older.md'],
    });

    expect(withoutPosts.has('blog.html')).toBe(false);
    expect(withoutPosts.get('sitemap.xml')).not.toContain('/blog');
    expect(withoutPosts.get('changelog.html')).not.toContain('href="/blog"');
    expect(files.get('help.html')).toContain('href="/blog"');
  });

  it('reads lists in front matter and rejects files without a title', () => {
    expect(parseFrontMatter(FIXTURES['/site/content/help/import-a-mesh.md'], 'x.md').data.covers).toEqual([
      'src/workspace/meshImport.ts',
      'src/workspace/usePartCreation.ts',
    ]);
    expect(parseFrontMatter(post('covers:\n- src/x.ts\ndraft: "true"'), 'x.md').data).toEqual({
      covers: ['src/x.ts'],
      draft: true,
    });
    expect(() => readContent({ '/site/content/blog/no-title.md': post('date: 2026-11-01') }, NOW)).toThrow(/title/);
  });

  it('builds from the committed content', () => {
    const content = readContent(CONTENT_FILES, NOW);

    expect(content.changelog.flatMap((entry) => entry.version ?? [])).toEqual(['0.1.2', '0.1.1', '0.1.0']);
    expect(content.help.length).toBeGreaterThan(0);
    expect(content.help.every((entry) => entry.covers.length > 0)).toBe(true);
  });
});
