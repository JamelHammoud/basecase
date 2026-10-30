import { platformBridge } from '../../utils/platformBridge';

export interface GuidePages {
  key: string;
  css: string;
  pages: HTMLElement[];
}

let cached: GuidePages | null = null;
let seeded: { key: string; html: string } | null = null;
const loading = new Map<string, Promise<GuidePages | null>>();

export const guidePagesKey = (id: string, generatedAt: string) => `${id}@${generatedAt}`;

function stripHandlers(root: ParentNode) {
  root.querySelectorAll('script, iframe, object, embed').forEach((el) => el.remove());

  for (const el of root.querySelectorAll('*')) {
    for (const attr of [...el.attributes]) if (attr.name.startsWith('on')) el.removeAttribute(attr.name);
  }
}

function parseGuide(key: string, html: string): GuidePages {
  const doc = new DOMParser().parseFromString(html, 'text/html');

  stripHandlers(doc);
  doc.querySelectorAll('img').forEach((img) => (img.decoding = 'async'));

  return {
    key,
    css: [...doc.querySelectorAll('style')].map((s) => s.textContent ?? '').join('\n'),
    pages: [...doc.querySelectorAll<HTMLElement>('section.page')],
  };
}

async function readGuide(key: string, id: string): Promise<GuidePages | null> {
  const html = seeded?.key === key ? seeded.html : await platformBridge.guideHtml(id);

  if (!html) return null;

  cached = parseGuide(key, html);
  seeded = null;

  return cached;
}

export function seedGuidePages(key: string, html: string) {
  seeded = { key, html };
}

export function loadGuidePages(id: string, generatedAt: string): Promise<GuidePages | null> {
  const key = guidePagesKey(id, generatedAt);

  if (cached?.key === key) return Promise.resolve(cached);

  const known = loading.get(key);

  if (known) return known;

  const read = readGuide(key, id).finally(() => loading.delete(key));

  loading.set(key, read);

  return read;
}

export function prefetchGuidePages(
  id: string,
  generatedAt: string,
  onLoad: (guide: GuidePages | null) => void,
): () => void {
  let live = true;
  const handle = requestIdleCallback(
    () =>
      void loadGuidePages(id, generatedAt).then(
        (guide) => live && onLoad(guide),
        () => live && onLoad(null),
      ),
    { timeout: 4000 },
  );

  return () => {
    live = false;
    cancelIdleCallback(handle);
  };
}
