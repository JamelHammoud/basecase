import { describe, expect, it } from 'vitest';
import { CONTENT_FILES } from '../pages/contentFiles';
import { renderPages } from '../pages/renderPages';
import { readContent } from '../pages/siteContent';
import { prepareArticles, searchArticles, type SearchData } from './search/search';

const NOW = new Date('2026-11-12T12:00:00Z');
const SCRIPT = '/assets/help-search-abc.js';

const BODY = [
  'Bring a model in.',
  '',
  '## Choose a file',
  '',
  '1. Press [[⌘K]].',
  '2. Choose **Import Mesh**.',
  '',
  '> [!WARNING]',
  '> Big files take a while.',
  '',
  '## Place it',
  '',
  'Drop it anywhere.',
  '',
  '## Print it',
  '',
  '| Format | Reads |',
  '| --- | --- |',
  '| STL | Yes |',
].join('\n');

const FIXTURES: Record<string, string> = {
  '/site/content/help/import-a-mesh.md': `---\ntitle: Import a mesh\ndate: 2026-11-01\nupdated: 2026-11-10\ncollection: design\ntype: task\ncovers:\n  - src/workspace/meshImport.ts\n---\n\n${BODY}\n`,
  '/site/content/help/what-a-mesh-is.md':
    '---\ntitle: What a mesh is\ndate: 2026-11-01\ncollection: design\ntype: concept\n---\n\n1. Triangles.\n2. Normals.\n',
  '/site/content/changelog/2026-11-01-entry.md': '---\ntitle: Entry\ndate: 2026-11-01\n---\n\nIt changed.\n',
};

const render = (files: Record<string, string>) =>
  new Map(
    renderPages(readContent(files, NOW), { stylesheets: ['/assets/index-abc.css'], helpScript: SCRIPT }).map(
      ({ fileName, source }) => [fileName, source],
    ),
  );

describe('help pages', () => {
  const files = render(FIXTURES);
  const article = files.get('help/import-a-mesh.html')!;

  it('writes the home, each collection and the search index, with the script only on help pages', () => {
    const home = files.get('help.html')!;

    expect(home).toContain('role="search"');
    expect(home).toContain('href="/help/design"');
    expect(home).toContain('2 articles');
    expect(files.get('help/design.html')).toContain('How-to');
    expect(files.get('help/design.html')).toContain('Concepts');
    expect(article).toContain(`<script type="module" src="${SCRIPT}"></script>`);
    expect(files.get('changelog.html')).not.toContain('<script');
    expect(files.get('sitemap.xml')).toContain('<loc>https://basecase.so/help/design</loc>');
  });

  it('gives an article a breadcrumb, its type, the updated date and an outline', () => {
    expect(article).toContain('aria-label="Breadcrumb"');
    expect(article).toMatch(/href="\/help\/design"[^>]*>Design<\/a>/);
    expect(article).toContain('How-to');
    expect(article).toContain('<time dateTime="2026-11-10">November 10, 2026</time>');
    expect(article).toContain('On this page');
    expect(article).toContain('href="#choose-a-file"');
    expect(article).toContain('id="choose-a-file"');
  });

  it('renders steps, key caps, warnings and tables', () => {
    expect(article).toContain('class="help-steps');
    expect(article).toMatch(/<kbd[^>]*>⌘<\/kbd><kbd[^>]*>K<\/kbd>/);
    expect(article).toMatch(/<aside[^>]*>.*Warning.*Big files take a while\./s);
    expect(article).not.toContain('[!WARNING]');
    expect(article).toContain('<table');
    expect(files.get('help/what-a-mesh-is.html')).not.toContain('help-steps');
  });

  it('links related articles and the next one in the collection', () => {
    expect(article).toContain('Related articles');
    expect(article).toMatch(/rel="next"[^>]*>.*What a mesh is/s);
  });

  it('finds an article by a word from its body', () => {
    const data = JSON.parse(files.get('help/search.json')!) as SearchData;
    const [first] = searchArticles(prepareArticles(data), 'normals');

    expect(first.article.path).toBe('/help/what-a-mesh-is');
    expect(data.collections).toEqual([{ title: 'Design', path: '/help/design' }]);
  });
});

describe('the committed help build', () => {
  const files = render(CONTENT_FILES);
  const data = JSON.parse(files.get('help/search.json')!) as SearchData;
  const prepared = prepareArticles(data);
  const top = (query: string) => searchArticles(prepared, query)[0]?.article.path;

  it('writes a page for every article and collection in the index', () => {
    expect(data.articles.length).toBeGreaterThan(0);
    expect(data.articles.every((entry) => files.has(`${entry.path.slice(1)}.html`))).toBe(true);
    expect(data.collections.every((collection) => files.has(`${collection.path.slice(1)}.html`))).toBe(true);
  });

  it('finds known articles by body words, synonyms and the app’s terms', () => {
    expect(top('bench sequence')).toBe('/help/calibrate-an-emulated-robot');
    expect(top('access token')).toBe('/help/publish-a-dataset-to-hugging-face');
    expect(top('joint map')).toBe('/help/export-a-robot-package');
    expect(top('huggingface')).toBe('/help/publish-a-dataset-to-hugging-face');
    expect(top('ruler')).toBe('/help/measure-a-part');
  });
});
