import { checkMark } from '../doc/guideIcons';
import type { GuidePages } from './guidePages';

const MARK = 'ready-mark';
const MARK_OFFSET_MM = 14.5;

export const READY_MARK_CSS = `.${MARK} { position: absolute; width: 6mm; height: 6mm; }
.${MARK} svg { width: 100%; height: 100%; }`;

export function markReadySteps(guide: GuidePages, ready: readonly boolean[]) {
  for (const page of guide.pages) {
    page.querySelectorAll(`.${MARK}`).forEach((mark) => mark.remove());

    for (const num of page.querySelectorAll<HTMLElement>('.num[data-step]')) {
      if (!ready[Number(num.dataset.step)]) continue;

      const mark = document.createElement('div');

      mark.className = MARK;
      mark.style.left = `calc(${num.style.left} + ${MARK_OFFSET_MM}mm)`;
      mark.style.top = num.style.top;
      mark.insertAdjacentHTML('afterbegin', checkMark());
      num.after(mark);
    }
  }
}
