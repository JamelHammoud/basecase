import { HELP_COLLECTIONS, type CollectionInfo } from './collections';
import { ARTICLE_TYPES, type HelpArticle } from './helpArticle';

export interface HelpCollection extends CollectionInfo {
  articles: HelpArticle[];
}

export interface HelpCenter {
  articles: HelpArticle[];
  collections: HelpCollection[];
  popular: HelpArticle[];
}

export interface HelpSource {
  article: HelpArticle;
  path: string;
}

const POPULAR_LIMIT = 6;
const RELATED_LIMIT = 4;

const typeRank = (article: HelpArticle) => ARTICLE_TYPES.indexOf(article.type);

export const readingOrder = (a: HelpArticle, b: HelpArticle) =>
  typeRank(a) - typeRank(b) || a.order - b.order || a.title.localeCompare(b.title);

export const collectionPath = (slug: string) => `/help/${slug}`;

function checkSlugs(sources: HelpSource[]) {
  const taken = new Map(HELP_COLLECTIONS.map(({ slug }) => [slug, `the ${slug} collection`]));

  for (const { article, path } of sources) {
    const owner = taken.get(article.slug);

    if (owner) throw new Error(`${path}: /help/${article.slug} is already ${owner}; rename the file`);

    taken.set(article.slug, path);
  }
}

function checkRelated(sources: HelpSource[]) {
  const slugs = new Set(sources.map(({ article }) => article.slug));

  for (const { article, path } of sources) {
    const missing = article.related.find((slug) => !slugs.has(slug));

    if (missing) throw new Error(`${path}: "related:" names ${missing}, which isn't a help article`);
  }
}

export function checkHelpSources(sources: HelpSource[]) {
  checkSlugs(sources);
  checkRelated(sources);
}

const newestFirst = (a: HelpArticle, b: HelpArticle) => b.updated.localeCompare(a.updated) || readingOrder(a, b);

function popularOf(articles: HelpArticle[]): HelpArticle[] {
  const marked = articles.filter((article) => article.popular);

  return (marked.length > 0 ? marked : [...articles].sort(newestFirst)).slice(0, POPULAR_LIMIT);
}

export function buildHelpCenter(published: HelpArticle[]): HelpCenter {
  const collections = HELP_COLLECTIONS.map((info) => ({
    ...info,
    articles: published.filter((article) => article.collection === info.slug).sort(readingOrder),
  })).filter((collection) => collection.articles.length > 0);
  const articles = collections.flatMap((collection) => collection.articles);

  return { articles, collections, popular: popularOf(articles) };
}

export const collectionOf = (center: HelpCenter, article: HelpArticle) =>
  center.collections.find((collection) => collection.slug === article.collection)!;

export function neighbours(center: HelpCenter, article: HelpArticle) {
  const { articles } = collectionOf(center, article);
  const index = articles.indexOf(article);

  return { previous: articles[index - 1], next: articles[index + 1] };
}

export function relatedTo(center: HelpCenter, article: HelpArticle): HelpArticle[] {
  const named = article.related.flatMap((slug) => center.articles.find((other) => other.slug === slug) ?? []);
  const fallback = collectionOf(center, article).articles.filter((other) => other !== article);

  return (named.length > 0 ? named : fallback).slice(0, RELATED_LIMIT);
}

export const countLabel = (count: number) => `${count} ${count === 1 ? 'article' : 'articles'}`;
