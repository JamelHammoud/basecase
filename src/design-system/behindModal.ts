export const behindModal = (anchor: Element) =>
  [...document.querySelectorAll('[aria-modal="true"]')].some((modal) => !modal.contains(anchor));
