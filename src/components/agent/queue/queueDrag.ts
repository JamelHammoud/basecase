export const QUEUE_ROW_PX = 36;
export const QUEUE_GAP_PX = 2;

const STEP = QUEUE_ROW_PX + QUEUE_GAP_PX;
const HALF = QUEUE_ROW_PX / 2;

export const rowTop = (index: number) => index * STEP;

const staysAbove = (index: number, from: number, overlayTop: number) =>
  index < from ? rowTop(index) + HALF <= overlayTop : rowTop(index) < overlayTop + HALF;

export function dropTarget(overlayTop: number, count: number, from: number) {
  let target = 0;

  for (let i = 0; i < count; i++) if (i !== from && staysAbove(i, from, overlayTop)) target++;

  return target;
}

export const lineTop = (target: number, from: number) => rowTop(target > from ? target + 1 : target) - QUEUE_GAP_PX / 2;
