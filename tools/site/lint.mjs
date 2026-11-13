import { parseFrontMatter } from '../../src/landing/pages/frontMatter.ts';
import { blocksOf } from './blocks.mjs';
import {
  bannedWords,
  copiedFromChangelog,
  helpLink,
  helpTitle,
  images,
  linkText,
  longSentences,
  pageLinks,
  paragraphLength,
  sentenceLength,
  summaryLength,
  title,
} from './rules.mjs';

const CONTENT_PATH = /(?:^|\/)site\/content\/(changelog|blog|help)\/([^/]+)\.md$/;

const EVERY_PAGE = [bannedWords, linkText, pageLinks, images, title];

export const RULES = {
  changelog: [...EVERY_PAGE, sentenceLength, paragraphLength, summaryLength, helpLink],
  blog: [...EVERY_PAGE, sentenceLength, paragraphLength, copiedFromChangelog],
  help: [...EVERY_PAGE, helpTitle],
};

function pageOf({ path, source }) {
  const match = CONTENT_PATH.exec(path);

  if (!match) return null;

  const [, kind, slug] = match;
  const { data } = parseFrontMatter(source, path);

  return { path, kind, slug, data, blocks: blocksOf(source) };
}

function siteOf(pages, exists) {
  const changelog = pages.filter((page) => page.kind === 'changelog');

  return {
    exists,
    pages: new Set(pages.map((page) => `${page.kind}/${page.slug}`)),
    changelogSentences: new Set(changelog.flatMap(longSentences).map(({ sentence }) => sentence)),
  };
}

export function lintSite({ files, exists }) {
  const pages = files.map(pageOf).filter(Boolean);
  const site = siteOf(pages, exists);

  return pages.flatMap((page) =>
    RULES[page.kind].flatMap((rule) => rule(page, site)).map((found) => ({ file: page.path, ...found })),
  );
}

export const formatProblem = ({ file, line, message }) => `${file}:${line}: ${message}`;
