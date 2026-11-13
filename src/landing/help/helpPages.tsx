import type { PageSpec, SiteFile } from '../pages/pageSpec';
import { entryPath } from '../pages/siteContent';
import type { HelpArticle } from './helpArticle';
import { HelpArticlePage } from './HelpArticlePage';
import { collectionPath, type HelpCenter, type HelpCollection } from './helpCenter';
import { HelpCollectionPage } from './HelpCollectionPage';
import { HelpHome } from './HelpHome';
import { searchData } from './search/searchIndex';
import { SEARCH_INDEX_PATH } from './search/searchPaths';

const homeSpec = (center: HelpCenter): PageSpec => ({
  fileName: 'help.html',
  head: {
    title: 'Basecase Help',
    description: 'How to design, simulate, build and run robots in Basecase.',
    path: '/help',
  },
  section: 'help',
  body: <HelpHome center={center} />,
  script: true,
});

const collectionSpec = (collection: HelpCollection): PageSpec => ({
  fileName: `help/${collection.slug}.html`,
  head: {
    title: `Basecase Help: ${collection.title}`,
    description: collection.description,
    path: collectionPath(collection.slug),
  },
  section: 'help',
  body: <HelpCollectionPage collection={collection} />,
  script: true,
});

const articleSpec = (center: HelpCenter, article: HelpArticle): PageSpec => ({
  fileName: `help/${article.slug}.html`,
  head: { title: article.title, description: article.summary, path: entryPath(article), image: article.image },
  section: 'help',
  body: <HelpArticlePage center={center} article={article} />,
  script: true,
});

export const helpSpecs = (center: HelpCenter): PageSpec[] => [
  homeSpec(center),
  ...center.collections.map(collectionSpec),
  ...center.articles.map((article) => articleSpec(center, article)),
];

export const helpFiles = (center: HelpCenter): SiteFile[] => [
  { fileName: SEARCH_INDEX_PATH.slice(1), source: `${JSON.stringify(searchData(center))}\n` },
];
