import { prepareArticles, searchArticles, type PreparedArticle, type SearchData } from './search';
import { noResultNodes, resultNodes } from './searchView';

interface Elements {
  form: HTMLFormElement;
  input: HTMLInputElement;
  list: HTMLElement;
}

interface Index {
  data: SearchData;
  prepared: PreparedArticle[];
}

const STEPS: Record<string, number> = { ArrowDown: 1, ArrowUp: -1 };

const options = (list: HTMLElement) => [...list.querySelectorAll<HTMLAnchorElement>('[role="option"]')];

const isTyping = (target: EventTarget | null) =>
  target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));

const isFocusShortcut = (event: KeyboardEvent) =>
  (event.key === '/' && !event.metaKey && !event.ctrlKey) ||
  (event.key.toLowerCase() === 'k' && (event.metaKey || event.ctrlKey));

function setOpen({ input, list }: Elements, open: boolean) {
  list.hidden = !open;
  input.setAttribute('aria-expanded', String(open));

  if (!open) input.removeAttribute('aria-activedescendant');
}

function activate(elements: Elements, index: number) {
  const all = options(elements.list);

  all.forEach((link, at) => link.setAttribute('aria-selected', String(at === index)));

  const active = all[index];

  if (!active) {
    elements.input.removeAttribute('aria-activedescendant');

    return;
  }

  elements.input.setAttribute('aria-activedescendant', active.id);
  active.scrollIntoView({ block: 'nearest' });
}

const activeIndex = (list: HTMLElement) =>
  options(list).findIndex((link) => link.getAttribute('aria-selected') === 'true');

function render(elements: Elements, index: Index | null) {
  const query = elements.input.value.trim();

  if (query === '' || !index) {
    setOpen(elements, false);

    return;
  }

  const results = searchArticles(index.prepared, query);

  elements.list.replaceChildren(
    ...(results.length > 0 ? resultNodes(results) : noResultNodes(query, index.data.collections)),
  );
  setOpen(elements, true);
  activate(elements, results.length > 0 ? 0 : -1);
}

function move(elements: Elements, step: number) {
  const count = options(elements.list).length;

  if (count === 0) return;

  activate(elements, (activeIndex(elements.list) + step + count) % count);
}

function onKey(elements: Elements, event: KeyboardEvent) {
  const step = STEPS[event.key];

  if (step !== undefined && !elements.list.hidden) {
    event.preventDefault();
    move(elements, step);

    return;
  }

  if (event.key !== 'Escape') return;

  event.preventDefault();

  if (elements.list.hidden) elements.input.value = '';

  setOpen(elements, false);
}

function onSubmit(elements: Elements, event: SubmitEvent) {
  const target = options(elements.list)[Math.max(0, activeIndex(elements.list))];

  event.preventDefault();

  if (target && !elements.list.hidden) window.location.assign(target.href);
}

export function attachSearch(elements: Elements, load: () => Promise<Index | null>) {
  const { form, input, list } = elements;
  const update = () => load().then((index) => render(elements, index));

  input.addEventListener('focus', () => void load());
  input.addEventListener('input', () => void update());
  input.addEventListener('keydown', (event) => onKey(elements, event));
  form.addEventListener('submit', (event) => onSubmit(elements, event));
  list.addEventListener('pointerdown', (event) => event.preventDefault());
  list.addEventListener('pointermove', (event) => {
    const link = event.target instanceof Element ? event.target.closest('[role="option"]') : null;

    if (link) activate(elements, options(list).indexOf(link as HTMLAnchorElement));
  });
  form.addEventListener('focusout', (event) => {
    if (!form.contains(event.relatedTarget as Node | null)) setOpen(elements, false);
  });
  document.addEventListener('keydown', (event) => {
    if (!isFocusShortcut(event) || isTyping(event.target)) return;

    event.preventDefault();
    input.focus();
  });

  const query = new URLSearchParams(window.location.search).get('q');

  if (query) {
    input.value = query;
    input.focus();
    void update();
  }
}

async function fetchIndex(url: string): Promise<Index> {
  const response = await fetch(url, { credentials: 'same-origin' });

  if (!response.ok) throw new Error(`${url} answered ${response.status}`);

  const data = (await response.json()) as SearchData;

  return { data, prepared: prepareArticles(data) };
}

export const loadIndex = (url: string) => {
  let pending: Promise<Index | null> | null = null;

  return () => {
    pending ??= fetchIndex(url).catch(() => {
      pending = null;

      return null;
    });

    return pending;
  };
};
