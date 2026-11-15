import { parseFrontMatter, type FrontMatterValue } from './frontMatter.ts';

export const HELP_HUB_BLOCK = '{{help-hub}}';

const HELP_PATH = /(?:^|\/)help\/([a-z0-9-]+)\.md$/;
const LAST_ORDER = 1000;

type Data = Record<string, FrontMatterValue>;

interface Page {
  path: string;
  slug: string;
  data: Data;
  source: string;
  body: string;
}

const hubKey = (slug: string) => `hub_${slug.replaceAll('-', '_')}`;
const isPublished = (page: Page, today: string) => page.data.draft !== true && String(page.data.date) <= today;

function helpPages(files: Record<string, string>): Page[] {
  return Object.entries(files).flatMap(([path, source]) => {
    const match = HELP_PATH.exec(path);

    if (!match) return [];

    return [{ path, slug: match[1], source, ...parseFrontMatter(source, path) }];
  });
}

function checkHub(page: Page) {
  const count = page.body.split(HELP_HUB_BLOCK).length - 1;

  if (page.data.hub_sort !== 'order' && page.data.hub_sort !== 'title') {
    throw new Error(`${page.path}: set "hub_sort:" to order or title`);
  }

  if (count !== 1) throw new Error(`${page.path}: a hub needs exactly one ${HELP_HUB_BLOCK} block`);
}

function checkContributions(page: Page, hubs: Page[]) {
  const keys = Object.keys(page.data).filter((key) => key.startsWith('hub_') && key !== 'hub_sort');

  for (const key of keys) {
    const name = key.replace(/_order$/, '');
    const hub = hubs.find((candidate) => hubKey(candidate.slug) === name);
    const value = page.data[name];
    const order = page.data[`${name}_order`];

    if (!hub || hub.slug === page.slug) throw new Error(`${page.path}: "${key}:" must name another help hub`);

    if (typeof value !== 'string' || !value.trim()) throw new Error(`${page.path}: "${name}:" needs hub text`);

    if (value.includes(HELP_HUB_BLOCK)) throw new Error(`${page.path}: hub text can't contain a hub block`);

    if (order !== undefined && (!Number.isInteger(Number(order)) || Number(order) < 1)) {
      throw new Error(`${page.path}: "${name}_order:" must be a whole number from 1`);
    }
  }
}

function hubBody(hub: Page, pages: Page[], today: string): string {
  const key = hubKey(hub.slug);
  const contributors = pages.filter((page) => typeof page.data[key] === 'string' && isPublished(page, today));

  contributors.sort((a, b) => {
    const order =
      hub.data.hub_sort === 'order'
        ? Number(a.data[`${key}_order`] ?? LAST_ORDER) - Number(b.data[`${key}_order`] ?? LAST_ORDER)
        : 0;

    return order || String(a.data.title).localeCompare(String(b.data.title)) || a.slug.localeCompare(b.slug);
  });

  return contributors.map((page) => page.data[key]).join('\n\n');
}

export function expandHelpHubs(files: Record<string, string>, now: Date): Record<string, string> {
  const pages = helpPages(files);
  const hubs = pages.filter((page) => page.data.hub_sort !== undefined || page.body.includes(HELP_HUB_BLOCK));
  const today = now.toISOString().slice(0, 10);
  const expanded = { ...files };

  hubs.forEach(checkHub);
  pages.forEach((page) => checkContributions(page, hubs));

  for (const hub of hubs) {
    expanded[hub.path] = hub.source.replace(HELP_HUB_BLOCK, () => hubBody(hub, pages, today));
  }

  return expanded;
}
