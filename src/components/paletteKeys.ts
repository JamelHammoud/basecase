export function listenForPaletteEscape(target: Window, close: () => void) {
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Escape') return;

    event.preventDefault();
    event.stopImmediatePropagation();
    close();
  };

  target.addEventListener('keydown', onKeyDown, true);

  return () => target.removeEventListener('keydown', onKeyDown, true);
}
