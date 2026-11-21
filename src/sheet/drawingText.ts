import type { DocumentText } from './drawingDocument';

export function drawingTextLines(text: string, size: number) {
  const width = Math.max(1, Math.floor(273 / size));
  const lines: string[] = [];

  for (let start = 0; start < text.length; start += width) lines.push(text.slice(start, start + width));

  return lines.length ? lines : [''];
}

export function drawingHeader(rows: Array<{ text: string; size: number }>) {
  const texts: DocumentText[] = [];
  let y = 8;

  for (const row of rows) {
    for (const text of drawingTextLines(row.text, row.size)) {
      texts.push({ at: [12, y], text, size: row.size });
      y += 5;
    }
  }

  return { texts, bottom: y };
}
