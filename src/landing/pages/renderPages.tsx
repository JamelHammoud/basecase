import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ArticlePage } from './ArticlePage';
import { ChangelogPage } from './ChangelogPage';
import { EntryList } from './EntryList';
import { changelogJson, changelogRss, sitemap } from './feeds';
import { entryPath, type ContentKind, type Entry, type SiteContent } from './siteContent';
import { SitePage, type PageHead } from './SitePage';

export interface SiteFile {
  fileName: string;
  source: string;
}

interface PageSpec {
  fileName: string;
  head: PageHead;
  section: ContentKind;
  body: React.ReactNode;
}

const CHANGELOG_FEEDS = [
  { href: '/changelog/rss.xml', type: 'application/rss+xml', title: 'Basecase Changelog' },
  { href: '/changelog.json', type: 'application/feed+json', title: 'Basecase Changelog' },
];

const articleSpec = (entry: Entry): PageSpec => ({
  fileName: `${entry.kind}/${entry.slug}.html`,
  head: { title: entry.title, description: entry.summary, path: entryPath(entry) },
  section: entry.kind,
  body: <ArticlePage entry={entry} />,
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
    {
      fileName: 'blog.html',
      head: { title: 'Basecase Blog', description: 'Posts about building Basecase.', path: '/blog' },
      section: 'blog',
      body: <EntryList title="Blog" entries={content.blog} empty="No posts" dated />,
    },
    {
      fileName: 'help.html',
      head: { title: 'Basecase Help', description: 'How to do things in Basecase.', path: '/help' },
      section: 'help',
      body: <EntryList title="Help" entries={content.help} empty="No articles" />,
    },
    ...content.blog.map(articleSpec),
    ...content.help.map(articleSpec),
  ];
}

const renderSpec = (spec: PageSpec, stylesheets: string[]): SiteFile => ({
  fileName: spec.fileName,
  source: `<!doctype html>\n${renderToStaticMarkup(
    <SitePage head={spec.head} section={spec.section} stylesheets={stylesheets}>
      {spec.body}
    </SitePage>,
  )}\n`,
});

export function renderPages(content: SiteContent, stylesheets: string[]): SiteFile[] {
  const specs = pageSpecs(content);
  const items = content.changelog.map((entry) => ({
    entry,
    html: renderToStaticMarkup(
      <ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml>
        {entry.body}
      </ReactMarkdown>,
    ),
  }));

  return [
    ...specs.map((spec) => renderSpec(spec, stylesheets)),
    { fileName: 'changelog/rss.xml', source: changelogRss(items) },
    { fileName: 'changelog.json', source: changelogJson(items) },
    { fileName: 'sitemap.xml', source: sitemap(['/', ...specs.map((spec) => spec.head.path)]) },
  ];
}
