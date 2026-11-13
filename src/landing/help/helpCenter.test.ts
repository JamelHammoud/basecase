import { describe, expect, it } from 'vitest';
import { CONTENT_FILES } from '../pages/contentFiles';
import { readContent } from '../pages/siteContent';
import { HELP_COLLECTIONS } from './collections';
import { extractHeadings } from './headings';
import { neighbours, relatedTo } from './helpCenter';

const NOW = new Date('2026-11-12T12:00:00Z');

const article = (fields: string, body = 'What it is for.') => `---\ndate: 2026-11-01\n${fields}\n---\n\n${body}\n`;

const task = (title: string, collection: string, extra = '') =>
  article(`title: ${title}\ncollection: ${collection}\ntype: task${extra ? `\n${extra}` : ''}`);

const help = (files: Record<string, string>) =>
  readContent(
    Object.fromEntries(Object.entries(files).map(([slug, source]) => [`/site/content/help/${slug}.md`, source])),
    NOW,
  ).help;

const FILES = {
  'measure-a-part': task('Measure a part', 'design', 'order: 2'),
  'import-a-mesh': task('Import a mesh', 'design', 'order: 1\npopular: true'),
  'how-meshes-work': article('title: How meshes work\ncollection: design\ntype: concept'),
  'share-a-scene': task('Share a scene', 'files-and-sharing', 'related:\n  - import-a-mesh'),
  'held-back': task('Held back', 'design', 'draft: true'),
};

describe('help collections', () => {
  const center = help(FILES);

  it('keeps the collections in the order of the robotics loop and drops empty ones', () => {
    expect(center.collections.map((collection) => collection.slug)).toEqual(['design', 'files-and-sharing']);
    expect(center.collections[0].description).toBe(HELP_COLLECTIONS[0].description);
  });

  it('orders a collection by type, then order, then title, and leaves drafts out', () => {
    expect(center.collections[0].articles.map((entry) => entry.slug)).toEqual([
      'import-a-mesh',
      'measure-a-part',
      'how-meshes-work',
    ]);
  });

  it('links previous and next within the collection', () => {
    const measure = center.articles.find((entry) => entry.slug === 'measure-a-part')!;
    const { previous, next } = neighbours(center, measure);

    expect(previous?.slug).toBe('import-a-mesh');
    expect(next?.slug).toBe('how-meshes-work');
  });

  it('uses related: when given and the same collection otherwise', () => {
    const share = center.articles.find((entry) => entry.slug === 'share-a-scene')!;
    const mesh = center.articles.find((entry) => entry.slug === 'import-a-mesh')!;

    expect(relatedTo(center, share).map((entry) => entry.slug)).toEqual(['import-a-mesh']);
    expect(relatedTo(center, mesh).map((entry) => entry.slug)).toEqual(['measure-a-part', 'how-meshes-work']);
  });

  it('features articles marked popular, or the newest when none are', () => {
    expect(center.popular.map((entry) => entry.slug)).toEqual(['import-a-mesh']);
    expect(help({ 'measure-a-part': FILES['measure-a-part'] }).popular).toHaveLength(1);
  });

  it('defaults updated to the date', () => {
    expect(center.articles[0].updated).toBe('2026-11-01');
    expect(help({ a: task('A', 'design', 'updated: 2026-11-05') }).articles[0].updated).toBe('2026-11-05');
  });
});

describe('help front matter', () => {
  const failure = (files: Record<string, string>) => () => help(files);

  it('fails the build with the file path', () => {
    expect(failure({ a: article('title: A\ntype: task') })).toThrow('/site/content/help/a.md: set "collection:"');
    expect(failure({ a: task('A', 'gardening') })).toThrow(/a\.md: set "collection:" to one of design/);
    expect(failure({ a: article('title: A\ncollection: design') })).toThrow(/a\.md: set "type:"/);
    expect(failure({ a: article('title: A\ncollection: design\ntype: tutorial') })).toThrow(/a\.md: set "type:"/);
    expect(failure({ a: task('A', 'design', 'colection: design') })).toThrow(/a\.md: "colection:" isn't a help field/);
    expect(failure({ a: task('A', 'design', 'updated: soon') })).toThrow(/a\.md: write "updated:"/);
    expect(failure({ a: task('A', 'design', 'updated: 2026-10-01') })).toThrow(/a\.md: "updated:" comes before/);
    expect(failure({ a: task('A', 'design', 'order: first') })).toThrow(/a\.md: write "order:"/);
    expect(failure({ a: task('A', 'design', 'popular: often') })).toThrow(/a\.md: write "popular:"/);
  });

  it('checks that related articles exist, counting drafts', () => {
    expect(failure({ a: task('A', 'design', 'related:\n  - nowhere') })).toThrow(/a\.md: "related:" names nowhere/);
    expect(failure({ a: task('A', 'design', 'related:\n  - a') })).toThrow(/a\.md: "related:" lists the article/);
    expect(
      help({ a: task('A', 'design', 'related:\n  - b'), b: task('B', 'design', 'draft: true') }).articles,
    ).toHaveLength(1);
  });

  it('keeps article and collection URLs unique', () => {
    expect(failure({ design: task('Design', 'design') })).toThrow(/design\.md: \/help\/design is already the design/);
  });
});

describe('headings', () => {
  it('lists second-level headings outside code with unique ids', () => {
    const body = '## Open **Export**\n\n```\n## not a heading\n```\n\n## Press [[⌘K]]\n\n### Detail\n\n## Open Export';

    expect(extractHeadings(body)).toEqual([
      { id: 'open-export', text: 'Open Export' },
      { id: 'press-k', text: 'Press ⌘K' },
      { id: 'open-export-2', text: 'Open Export' },
    ]);
  });
});

describe('committed help', () => {
  const center = readContent(CONTENT_FILES, NOW).help;

  it('puts every article in a collection with a type', () => {
    expect(center.articles.length).toBeGreaterThan(0);
    expect(center.collections.reduce((sum, collection) => sum + collection.articles.length, 0)).toBe(
      center.articles.length,
    );
    expect(new Set(center.articles.map((entry) => entry.slug)).size).toBe(center.articles.length);
  });

  it('gives every collection a title and a description', () => {
    expect(new Set(HELP_COLLECTIONS.map((collection) => collection.slug)).size).toBe(HELP_COLLECTIONS.length);
    expect(HELP_COLLECTIONS.every((collection) => collection.title && collection.description)).toBe(true);
  });
});
