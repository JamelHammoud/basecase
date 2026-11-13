import { parseFrontMatter, type FrontMatterValue } from './frontMatter';
import type { ContentKind } from './sections';

export interface Entry {
  kind: ContentKind;
  slug: string;
  title: string;
  date: string;
  body: string;
  summary: string;
  covers: string[];
  version?: string;
  line?: string;
}

export type SiteContent = Record<ContentKind, Entry[]>;

interface Draft {
  entry: Entry;
  draft: boolean;
}

const CONTENT_PATH = /(?:^|\/)(blog|help|changelog)\/([^/]+)\.md$/;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

const text = (value: FrontMatterValue | undefined) => (typeof value === 'string' && value !== '' ? value : undefined);

const plainText = (markdown: string) =>
  markdown
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*_`>#]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

const firstParagraph = (body: string) => plainText(body.split(/\n\s*\n/)[0] ?? '');

function required(data: Record<string, FrontMatterValue>, key: string, path: string): string {
  const value = text(data[key]);

  if (!value) throw new Error(`${path}: add "${key}:" to the front matter`);

  return value;
}

function entryFrom(path: string, source: string): Draft {
  const match = CONTENT_PATH.exec(path);

  if (!match) throw new Error(`${path}: put content in site/content/blog, help or changelog`);

  const [, kind, slug] = match;

  if (!SLUG.test(slug)) throw new Error(`${path}: name the file in lowercase words joined by dashes`);

  const { data, body } = parseFrontMatter(source, path);
  const date = required(data, 'date', path);

  if (!DATE.test(date)) throw new Error(`${path}: write the date as YYYY-MM-DD`);

  const covers = data.covers;
  const entry: Entry = {
    kind: kind as ContentKind,
    slug,
    title: required(data, 'title', path),
    date,
    body,
    summary: firstParagraph(body),
    covers: Array.isArray(covers) ? covers : [],
    version: text(data.version),
    line: text(data.line),
  };

  return { entry, draft: data.draft === true };
}

const newestFirst = (a: Entry, b: Entry) => b.date.localeCompare(a.date) || a.slug.localeCompare(b.slug);

const byTitle = (a: Entry, b: Entry) => a.title.localeCompare(b.title);

export const isoDay = (now: Date) => now.toISOString().slice(0, 10);

export function readContent(files: Record<string, string>, now: Date): SiteContent {
  const today = isoDay(now);
  const published = Object.entries(files)
    .map(([path, source]) => entryFrom(path, source))
    .filter(({ entry, draft }) => !draft && entry.date <= today)
    .map(({ entry }) => entry);
  const ofKind = (kind: ContentKind) => published.filter((entry) => entry.kind === kind);

  return {
    changelog: ofKind('changelog').sort(newestFirst),
    blog: ofKind('blog').sort(newestFirst),
    help: ofKind('help').sort(byTitle),
  };
}

export const SITE_URL = 'https://basecase.so';

export const entryPath = (entry: Entry) =>
  entry.kind === 'changelog' ? `/changelog#${entry.slug}` : `/${entry.kind}/${entry.slug}`;

const DAY_FORMAT = new Intl.DateTimeFormat('en-US', { dateStyle: 'long', timeZone: 'UTC' });

export const formatDay = (date: string) => DAY_FORMAT.format(new Date(`${date}T00:00:00Z`));
