import type { FrontMatterValue } from '../pages/frontMatter';
import type { Entry } from '../pages/siteContent';
import { HELP_COLLECTIONS } from './collections';
import { extractHeadings, type Heading } from './headings';

export const ARTICLE_TYPES = ['task', 'concept', 'reference', 'troubleshooting'] as const;

export type ArticleType = (typeof ARTICLE_TYPES)[number];

export interface HelpArticle extends Entry {
  collection: string;
  type: ArticleType;
  updated: string;
  related: string[];
  keywords: string[];
  popular: boolean;
  order: number;
  headings: Heading[];
}

const FIELDS = new Set([
  'title',
  'date',
  'updated',
  'collection',
  'type',
  'covers',
  'related',
  'keywords',
  'popular',
  'order',
  'image',
  'draft',
]);

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const LAST_ORDER = 1000;

type Data = Record<string, FrontMatterValue>;

const list = (value: FrontMatterValue | undefined) => (Array.isArray(value) ? value : []);

function checkFields(data: Data, path: string) {
  const unknown = Object.keys(data).find((key) => !FIELDS.has(key));

  if (unknown) throw new Error(`${path}: "${unknown}:" isn't a help field; use ${[...FIELDS].join(', ')}`);
}

function collectionOf(data: Data, path: string): string {
  const slug = data.collection;
  const known = HELP_COLLECTIONS.map((collection) => collection.slug);

  if (typeof slug === 'string' && known.includes(slug)) return slug;

  throw new Error(`${path}: set "collection:" to one of ${known.join(', ')}`);
}

function typeOf(data: Data, path: string): ArticleType {
  const type = ARTICLE_TYPES.find((name) => name === data.type);

  if (!type) throw new Error(`${path}: set "type:" to one of ${ARTICLE_TYPES.join(', ')}`);

  return type;
}

function updatedOf(data: Data, entry: Entry, path: string): string {
  const updated = data.updated ?? entry.date;

  if (typeof updated !== 'string' || !DATE.test(updated)) throw new Error(`${path}: write "updated:" as YYYY-MM-DD`);

  if (updated < entry.date) throw new Error(`${path}: "updated:" comes before "date:"`);

  return updated;
}

function orderOf(data: Data, path: string): number {
  if (data.order === undefined) return LAST_ORDER;

  const order = Number(data.order);

  if (!Number.isInteger(order) || order < 1) throw new Error(`${path}: write "order:" as a whole number from 1`);

  return order;
}

function relatedOf(data: Data, slug: string, path: string): string[] {
  const related = list(data.related);

  if (related.includes(slug)) throw new Error(`${path}: "related:" lists the article itself`);

  return related;
}

export function readHelpArticle(entry: Entry, data: Data, path: string): HelpArticle {
  checkFields(data, path);

  if (data.popular !== undefined && typeof data.popular !== 'boolean') {
    throw new Error(`${path}: write "popular:" as true or false`);
  }

  return {
    ...entry,
    collection: collectionOf(data, path),
    type: typeOf(data, path),
    updated: updatedOf(data, entry, path),
    related: relatedOf(data, entry.slug, path),
    keywords: list(data.keywords),
    popular: data.popular === true,
    order: orderOf(data, path),
    headings: extractHeadings(entry.body),
  };
}
