import { renderToStaticMarkup } from 'react-dom/server';
import ReactMarkdown, { defaultUrlTransform } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ArticlePage } from './ArticlePage';
import { ChangelogPage } from './ChangelogPage';
import { EntryList } from './EntryList';
import { helpFiles, helpSpecs } from '../help/helpPages';
import { changelogJson, changelogRss, sitemap } from './feeds';
import type { PageSpec, SiteFile } from './pageSpec';
import { sectionsWithBlog, type Section } from './sections';
import { absoluteUrl, entryPath, type Entry, type SiteContent } from './siteContent';
import { SitePage } from './SitePage';

export interface SiteAssets {
  stylesheets: string[];
  helpScript?: string;
}

const CHANGELOG_FEEDS = [
  { href: '/changelog/rss.xml', type: 'application/rss+xml', title: 'Basecase Changelog' },
  { href: '/changelog.json', type: 'application/feed+json', title: 'Basecase Changelog' },
];

const articleSpec = (entry: Entry): PageSpec => ({
  fileName: `${entry.kind}/${entry.slug}.html`,
  head: { title: entry.title, description: entry.summary, path: entryPath(entry), image: entry.image },
  section: entry.kind,
  body: <ArticlePage entry={entry} />,
});

const blogSpec = (posts: Entry[]): PageSpec => ({
  fileName: 'blog.html',
  head: { title: 'Basecase Blog', description: 'Posts about building Basecase.', path: '/blog' },
  section: 'blog',
  body: <EntryList title="Blog" entries={posts} dated />,
});

function pageSpecs(content: SiteContent): PageSpec[] {
  return [
    {
      fileName: 'changelog.html',
      head: {
        title: 'Basecase Changelog',
        description: 'New features, improvements and fixes in Basecase.',
        path: '/changelog',
        feeds: CHANGELOG_FEEDS,
      },
      section: 'changelog',
      body: <ChangelogPage entries={content.changelog} />,
    },
    ...(content.blog.length > 0 ? [blogSpec(content.blog)] : []),
    ...content.changelog.map(articleSpec),
    ...content.blog.map(articleSpec),
    ...helpSpecs(content.help),
  ];
}

const renderSpec = (spec: PageSpec, sections: Section[], assets: SiteAssets): SiteFile => ({
  fileName: spec.fileName,
  source: `<!doctype html>\n${renderToStaticMarkup(
    <SitePage
      head={spec.head}
      section={spec.section}
      sections={sections}
      stylesheets={assets.stylesheets}
      script={spec.script ? assets.helpScript : undefined}
    >
      {spec.body}
    </SitePage>,
  )}\n`,
});

export function renderPages(content: SiteContent, assets: SiteAssets): SiteFile[] {
  const specs = pageSpecs(content);
  const sections = sectionsWithBlog(content.blog.length > 0);
  const items = content.changelog.map((entry) => ({
    entry,
    html: renderToStaticMarkup(
      <>
        {entry.image && <img src={absoluteUrl(entry.image)} alt="" />}
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          skipHtml
          urlTransform={(url) => absoluteUrl(defaultUrlTransform(url))}
        >
          {entry.body}
        </ReactMarkdown>
      </>,
    ),
  }));

  return [
    ...specs.map((spec) => renderSpec(spec, sections, assets)),
    ...helpFiles(content.help),
    { fileName: 'changelog/rss.xml', source: changelogRss(items) },
    { fileName: 'changelog.json', source: changelogJson(items) },
    { fileName: 'sitemap.xml', source: sitemap(['/', ...specs.map((spec) => spec.head.path)]) },
  ];
}
