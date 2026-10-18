const SKIPPED_IMAGE = /badge|shields\.io|favicon|logo|avatar|emoji|sprite|pixel|tracking/i;

function absoluteImageUrl(src, base) {
  if (!src || src.startsWith('data:')) return null;

  let abs;

  try {
    abs = new URL(src.replace(/&amp;/g, '&'), base).href;
  } catch {
    return null;
  }

  if (/\.(svg|ico)(\?|$)/i.test(abs) || SKIPPED_IMAGE.test(abs)) return null;

  return abs;
}

function addImage(found, base, { src, alt = '', size = 0 }) {
  const abs = absoluteImageUrl(src, base);

  if (!abs) return;

  const prev = found.get(abs);

  if (!prev || (!prev.alt && alt) || size > prev.size)
    found.set(abs, { alt: alt || prev?.alt || '', size: Math.max(size, prev?.size ?? 0) });
}

function imgTagImage(tag) {
  const attr = (n) => new RegExp(`\\b${n}=["']([^"']*)["']`, 'i').exec(tag)?.[1];
  const w = Number(attr('width')) || 0;
  const h = Number(attr('height')) || 0;

  if ((w && w < 64) || (h && h < 64)) return null;

  const srcset = attr('srcset') || attr('data-srcset');
  const best = srcset
    ?.split(',')
    .map((s) => s.trim().split(/\s+/)[0])
    .pop();

  return { src: attr('data-canonical-src') || best || attr('data-src') || attr('src'), alt: attr('alt'), size: w * h };
}

export function pageImages(html, base) {
  const found = new Map();

  for (const m of html.matchAll(/<meta[^>]+(?:property|name)=["'](?:og:image|twitter:image)["'][^>]*>/gi)) {
    addImage(found, base, { src: /content=["']([^"']+)["']/i.exec(m[0])?.[1], alt: 'page preview' });
  }

  for (const m of html.matchAll(/<img\b[^>]*>/gi)) {
    const image = imgTagImage(m[0]);

    if (image) addImage(found, base, image);
  }

  for (const m of html.matchAll(/!\[([^\]]*)\]\(([^)\s]+)/g)) addImage(found, base, { src: m[2], alt: m[1] });

  for (const m of html.matchAll(/https?:\/\/[^\s"'<>()]+\.(?:png|jpe?g|webp)(?:\?[^\s"'<>()]*)?/gi))
    addImage(found, base, { src: m[0] });

  return [...found.entries()].sort((a, b) => b[1].size - a[1].size).slice(0, 80);
}
