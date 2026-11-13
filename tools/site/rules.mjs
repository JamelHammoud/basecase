import { SITE_BANNED, VAGUE_ALT, VAGUE_LINK_TEXT } from './banned.mjs';
import { IMAGE, LINK, plainText, prose, sentencesOf, wordCount } from './blocks.mjs';

export const MAX_SENTENCE_WORDS = 25;
export const MAX_PARAGRAPH_SENTENCES = 5;
export const MAX_SUMMARY_SENTENCES = 2;
export const MAX_TITLE_CHARS = 65;
export const HELP_CENTER_OPENED = '2026-11-12';
export const MIN_SHARED_WORDS = 8;

const PAGE_INDEXES = new Set(['/', '/changelog', '/blog', '/help']);
const PAGE_LINK = /^\/(changelog|blog|help)\/([^/#?]+)/;

const problem = (line, message) => ({ line, message });

export function sentenceLength(page) {
  return prose(page.blocks).flatMap((block) =>
    sentencesOf(block.text)
      .map((sentence) => ({ sentence, words: wordCount(sentence) }))
      .filter(({ words }) => words > MAX_SENTENCE_WORDS)
      .map(({ sentence, words }) =>
        problem(block.line, `a sentence of ${words} words; split it (§3f): “${sentence.slice(0, 60)}…”`),
      ),
  );
}

export function paragraphLength(page) {
  return page.blocks
    .filter((block) => block.kind === 'paragraph')
    .map((block) => ({ block, count: sentencesOf(block.text).length }))
    .filter(({ count }) => count > MAX_PARAGRAPH_SENTENCES)
    .map(({ block, count }) => problem(block.line, `a paragraph of ${count} sentences; keep it to 5 (§3f)`));
}

export function summaryLength(page) {
  const first = page.blocks.find((block) => block.kind === 'paragraph');
  const count = first ? sentencesOf(first.text).length : 0;

  if (count <= MAX_SUMMARY_SENTENCES) return [];

  return [problem(first.line, `the first paragraph has ${count} sentences; the list shows it alone, so keep it to 2`)];
}

export function bannedWords(page) {
  return page.blocks
    .filter((block) => block.kind !== 'image' && block.kind !== 'table')
    .flatMap((block) => {
      const text = plainText(block.text);

      return SITE_BANNED.map((pattern) => pattern.exec(text))
        .filter(Boolean)
        .map((match) => problem(block.line, `“${match[0]}” is on the banned list; say the specific thing (§3f)`));
    });
}

const linksIn = (block) => [...block.text.matchAll(LINK)].map(([, text, href]) => ({ text, href }));

export function linkText(page) {
  return page.blocks.flatMap((block) =>
    linksIn(block)
      .filter(({ text }) => VAGUE_LINK_TEXT.test(plainText(text)))
      .map(({ text }) => problem(block.line, `link text “${text}” doesn't say where it goes`)),
  );
}

function brokenLink(href, site) {
  if (PAGE_INDEXES.has(href)) return false;

  const match = PAGE_LINK.exec(href);

  return Boolean(match) && !site.pages.has(`${match[1]}/${match[2]}`);
}

export function pageLinks(page, site) {
  return page.blocks.flatMap((block) =>
    linksIn(block)
      .filter(({ href }) => brokenLink(href, site))
      .map(({ href }) => problem(block.line, `link to ${href} goes to no page in site/content`)),
  );
}

const imagesIn = (block) => [...block.text.matchAll(IMAGE)].map(([, alt, src]) => ({ alt, src }));

function imageProblems({ alt, src }, line, site) {
  const missing = src.startsWith('/') && !site.exists(src);

  return [
    missing && problem(line, `image ${src} isn't in site/public`),
    VAGUE_ALT.test(alt.trim()) && problem(line, `image ${src} needs alt text that says what's on screen`),
  ].filter(Boolean);
}

export function images(page, site) {
  const cover = typeof page.data.image === 'string' ? page.data.image : null;
  const coverProblems = cover && !site.exists(cover) ? [problem(1, `cover ${cover} isn't in site/public`)] : [];

  return [
    ...coverProblems,
    ...page.blocks.flatMap((block) => imagesIn(block).flatMap((image) => imageProblems(image, block.line, site))),
  ];
}

export function title(page) {
  const text = String(page.data.title ?? '');

  return [
    text.length > MAX_TITLE_CHARS && problem(1, `the title has ${text.length} characters; keep it to 65`),
    /[.?!:]$/.test(text) && problem(1, `the title ends in “${text.at(-1)}”; drop it`),
  ].filter(Boolean);
}

const isGerund = (word) => word.length >= 6 && /ing$/i.test(word);

export function helpTitle(page) {
  const text = String(page.data.title ?? '');
  const [first = ''] = text.split(/\s+/);
  const wrong = /^how to\b/i.test(text) || isGerund(first);

  return wrong ? [problem(1, `“${text}”: start a task title with its verb, not “How to” or an -ing word (§3f)`)] : [];
}

export function helpLink(page) {
  const date = String(page.data.date ?? '');
  const linked = page.blocks.some((block) => linksIn(block).some(({ href }) => href.startsWith('/help/')));

  if (date < HELP_CENTER_OPENED || linked) return [];

  return [problem(1, 'link the help article for this change by its title (§3f)')];
}

export const longSentences = (page) =>
  prose(page.blocks)
    .flatMap((block) => sentencesOf(block.text).map((sentence) => ({ sentence, line: block.line })))
    .filter(({ sentence }) => wordCount(sentence) >= MIN_SHARED_WORDS);

export function copiedFromChangelog(page, site) {
  return longSentences(page)
    .filter(({ sentence }) => site.changelogSentences.has(sentence))
    .map(({ sentence, line }) =>
      problem(line, `“${sentence.slice(0, 60)}…” is copied from the changelog; link the entry instead`),
    );
}
