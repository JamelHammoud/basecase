import { entryPath, SITE_URL, type Entry } from './siteContent';

export interface FeedItem {
  entry: Entry;
  html: string;
}

const CHANGELOG = {
  title: 'Basecase Changelog',
  description: 'New features, improvements and fixes in Basecase.',
  page: `${SITE_URL}/changelog`,
  rss: `${SITE_URL}/changelog/rss.xml`,
  json: `${SITE_URL}/changelog.json`,
};

const XML_ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' };

const xml = (value: string) => value.replace(/[&<>"']/g, (char) => XML_ESCAPES[char]);

const published = (entry: Entry) => new Date(`${entry.date}T00:00:00Z`);

const rssItem = ({ entry, html }: FeedItem) => {
  const url = `${SITE_URL}${entryPath(entry)}`;

  return [
    '    <item>',
    `      <title>${xml(entry.title)}</title>`,
    `      <link>${xml(url)}</link>`,
    `      <guid isPermaLink="true">${xml(url)}</guid>`,
    `      <pubDate>${published(entry).toUTCString()}</pubDate>`,
    `      <description>${xml(html)}</description>`,
    '    </item>',
  ].join('\n');
};

export function changelogRss(items: FeedItem[]): string {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
    '  <channel>',
    `    <title>${CHANGELOG.title}</title>`,
    `    <link>${CHANGELOG.page}</link>`,
    `    <description>${CHANGELOG.description}</description>`,
    '    <language>en</language>',
    `    <atom:link href="${CHANGELOG.rss}" rel="self" type="application/rss+xml" />`,
    ...items.map(rssItem),
    '  </channel>',
    '</rss>',
    '',
  ].join('\n');
}

export function changelogJson(items: FeedItem[]): string {
  const feed = {
    version: 'https://jsonfeed.org/version/1.1',
    title: CHANGELOG.title,
    description: CHANGELOG.description,
    home_page_url: CHANGELOG.page,
    feed_url: CHANGELOG.json,
    language: 'en',
    items: items.map(({ entry, html }) => ({
      id: `${SITE_URL}${entryPath(entry)}`,
      url: `${SITE_URL}${entryPath(entry)}`,
      title: entry.title,
      date_published: published(entry).toISOString(),
      content_html: html,
      content_text: entry.body,
      ...(entry.version ? { _basecase: { version: entry.version } } : {}),
    })),
  };

  return `${JSON.stringify(feed, null, 2)}\n`;
}

export function sitemap(paths: string[]): string {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...paths.map((path) => `  <url>\n    <loc>${xml(`${SITE_URL}${path}`)}</loc>\n  </url>`),
    '</urlset>',
    '',
  ].join('\n');
}
