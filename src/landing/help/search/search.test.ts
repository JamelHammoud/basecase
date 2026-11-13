import { describe, expect, it } from 'vitest';
import { prepareArticles, queryWords, searchArticles, snippetOf, type SearchArticle } from './search';
import { safePath } from './searchView';

const doc = (path: string, title: string, text: string, extra: Partial<SearchArticle> = {}): SearchArticle => ({
  path,
  title,
  collection: 'Design',
  type: 'How-to',
  summary: text.split('.')[0],
  headings: [],
  keywords: [],
  text,
  ...extra,
});

const ARTICLES = prepareArticles({
  collections: [],
  articles: [
    doc('/help/import-a-mesh', 'Import a mesh', 'Bring an STL or OBJ file in. Press ⌘K and choose Import Mesh.'),
    doc('/help/share-a-scene', 'Share a scene', 'Save a scene as a .basecase file to send to someone.'),
    doc('/help/slice-plates', 'Slice plates', 'Lay out plates and send them to the printer.', { keywords: ['bambu'] }),
    doc('/help/paint-a-part', 'Paint a part', 'Pick a color for the part.'),
    doc('/help/fix-a-crash', 'When the app quits', 'Reopen it and send the report.', { headings: ['Send a report'] }),
  ],
});

const paths = (query: string) => searchArticles(ARTICLES, query).map((result) => result.article.path);

describe('help search', () => {
  it('ranks a title match above a body match', () => {
    expect(paths('mesh')[0]).toBe('/help/import-a-mesh');
    expect(paths('send')).toEqual(['/help/fix-a-crash', '/help/share-a-scene', '/help/slice-plates']);
  });

  it('matches every word by prefix as you type, and needs every word', () => {
    expect(paths('imp')).toEqual(['/help/import-a-mesh']);
    expect(paths('scene printer')).toEqual([]);
    expect(paths('send prin')).toEqual(['/help/slice-plates']);
    expect(paths('imp mes')).toEqual(['/help/import-a-mesh']);
  });

  it('finds articles by synonyms, plurals, keywords and key glyphs', () => {
    expect(paths('3mf')).toEqual(['/help/slice-plates']);
    expect(paths('scenes')).toEqual(['/help/share-a-scene']);
    expect(paths('Bambu')).toEqual(['/help/slice-plates']);
    expect(paths('⌘K')).toEqual(['/help/import-a-mesh']);
    expect(paths('command palette')).toEqual(['/help/import-a-mesh']);
    expect(paths('crash')).toEqual(['/help/fix-a-crash']);
    expect(paths('colour')).toEqual(['/help/paint-a-part']);
  });

  it('ignores stop words and accents', () => {
    expect(queryWords('How do I import a mesh')).toEqual(['import', 'mesh']);
    expect(queryWords('the')).toEqual(['the']);
    expect(paths('Impórt')).toEqual(['/help/import-a-mesh']);
    expect(paths('   ')).toEqual([]);
  });

  it('cuts a snippet around the first match at a word start', () => {
    const text = `${'word '.repeat(30)}then press Import Mesh to finish the job.`;

    expect(snippetOf(text, ['import'])).toMatchObject({ match: 'Import', after: ' Mesh to finish the job.' });
    expect(snippetOf(text, ['import'])?.before.startsWith('…')).toBe(true);
    expect(snippetOf('reimport only', ['import'])).toBeNull();
  });

  it('only links to help pages', () => {
    expect(safePath('/help/import-a-mesh')).toBe('/help/import-a-mesh');
    expect(safePath('javascript:alert(1)')).toBe('/help');
    expect(safePath('https://example.com/help/x')).toBe('/help');
  });
});
