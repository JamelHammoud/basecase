export const TAB_GAP = 6;

export interface TabBox {
  left: number;
  width: number;
}

export interface TabDrag {
  id: string;
  dx: number;
}

export function dropIndex(boxes: TabBox[], from: number, dx: number) {
  const leftEdge = boxes[from].left + dx;
  const rightEdge = leftEdge + boxes[from].width;
  let to = from;

  boxes.forEach((r, i) => {
    const mid = r.left + r.width / 2;

    if (i < from && leftEdge <= mid) to = Math.min(to, i);

    if (i > from && rightEdge >= mid) to = Math.max(to, i);
  });

  return to;
}

export function dragShift(boxes: TabBox[], from: number, index: number, dx: number) {
  if (index === from) return dx;

  const to = dropIndex(boxes, from, dx);
  const room = boxes[from].width + TAB_GAP;

  if (from < to && index > from && index <= to) return -room;

  if (to < from && index >= to && index < from) return room;

  return 0;
}
