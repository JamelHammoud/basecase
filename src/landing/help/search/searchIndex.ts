import { collectionPath, type HelpCenter } from '../helpCenter';
import type { HelpArticle } from '../helpArticle';
import { inlineText } from '../headings';
import { entryPath } from '../../pages/siteContent';
import { TYPE_LABELS } from '../typeLabels';
import type { SearchArticle, SearchData } from './search';

export const searchableText = (markdown: string) =>
  inlineText(
    markdown
      .replace(/^\s*>\s*\[!(NOTE|WARNING)\]/gm, '')
      .replace(/^\s*(#{1,6}|>|[-*+]|\d+\.)\s+/gm, '')
      .replace(/^\s*(```|~~~).*$/gm, ''),
  );

const searchArticle = (article: HelpArticle, collection: string): SearchArticle => ({
  path: entryPath(article),
  title: article.title,
  collection,
  type: TYPE_LABELS[article.type],
  summary: article.summary,
  headings: article.headings.map((heading) => heading.text),
  keywords: article.keywords,
  text: searchableText(article.body),
});

export const searchData = (center: HelpCenter): SearchData => ({
  articles: center.collections.flatMap((collection) =>
    collection.articles.map((article) => searchArticle(article, collection.title)),
  ),
  collections: center.collections.map(({ slug, title }) => ({ title, path: collectionPath(slug) })),
});
