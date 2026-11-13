import type { SearchCollection, SearchResult, Snippet } from './search';

const HELP_PATH = /^\/help\/[a-z0-9-]+$/;
const OPTION_CLASS =
  'flex flex-col gap-[2px] px-[12px] py-[10px] rounded-[8px] no-underline cursor-pointer aria-selected:bg-white/[0.08]';
const MARK_CLASS = 'bg-transparent font-semibold text-white/90';
const LABEL_CLASS = 'px-[12px] pt-[10px] pb-[6px] text-[13px] font-medium text-white/50';

export const safePath = (path: string) => (HELP_PATH.test(path) ? path : '/help');

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string) {
  const node = document.createElement(tag);

  node.className = className;

  if (text !== undefined) node.textContent = text;

  return node;
}

function option(href: string, index: number): HTMLAnchorElement {
  const link = element('a', OPTION_CLASS);

  link.href = safePath(href);
  link.id = `help-search-option-${index}`;
  link.setAttribute('role', 'option');
  link.setAttribute('aria-selected', 'false');
  link.tabIndex = -1;

  return link;
}

function snippetLine(snippet: Snippet | null, summary: string): HTMLElement {
  const line = element('span', 'text-[13px] leading-[1.45] text-white/60 line-clamp-2');

  if (!snippet) {
    line.textContent = summary;

    return line;
  }

  line.append(snippet.before, element('mark', MARK_CLASS, snippet.match), snippet.after);

  return line;
}

function resultOption(result: SearchResult, index: number): HTMLElement {
  const link = option(result.article.path, index);
  const top = element('span', 'flex items-baseline justify-between gap-[12px]');

  top.append(
    element('span', 'text-[15px] leading-[1.35] font-medium text-white/90', result.article.title),
    element('span', 'shrink-0 text-[13px] text-white/50', result.article.collection),
  );
  link.append(top, snippetLine(result.snippet, result.article.summary));

  return link;
}

export const resultNodes = (results: SearchResult[]) => results.map(resultOption);

export function noResultNodes(query: string, collections: SearchCollection[]): HTMLElement[] {
  const message = element('p', 'px-[12px] pt-[10px] pb-[4px] text-[14px] text-white/90', `No matches for “${query}”`);
  const label = element('p', LABEL_CLASS, 'Collections');
  const links = collections.map((collection, index) => {
    const link = option(collection.path, index);

    link.append(element('span', 'text-[14px] text-white/90', collection.title));

    return link;
  });

  message.setAttribute('role', 'presentation');
  label.setAttribute('role', 'presentation');

  return [message, label, ...links];
}
