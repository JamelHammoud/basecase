import { PdfWriter, pdfNumber, pdfString, pdfStream, ref } from '../cases/mat/pdfWriter';
import type { DrawingDocument } from './drawingDocument';
import { drawingNumber } from './drawingDocument';

const xml = (text: string) =>
  text.replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[c]!);
const point = (p: number[]) => p.map(drawingNumber).join(' ');
const PT = 72 / 25.4;

export function drawingSvg(documents: DrawingDocument[]): string {
  const pages = documents.map((doc, index) => {
    const lines = doc.lines
      .map(
        (line) =>
          `<path d="M ${point(line.a)} L ${point(line.b)}" fill="none" stroke="black" stroke-width="0.2"${line.hidden ? ' stroke-dasharray="2 1"' : ''}/>`,
      )
      .join('');
    const texts = doc.texts
      .map(
        ({ at, text, size }) =>
          `<text x="${drawingNumber(at[0])}" y="${drawingNumber(at[1])}" font-family="sans-serif" font-size="${size}">${xml(text)}</text>`,
      )
      .join('');

    return `<g transform="translate(0 ${210 * index})">${lines}${texts}</g>`;
  });

  return `<svg xmlns="http://www.w3.org/2000/svg" width="297mm" height="${210 * documents.length}mm" viewBox="0 0 297 ${210 * documents.length}">${pages.join('')}</svg>`;
}

function latinText(text: string) {
  if (/[^\x20-\xff]/.test(text)) throw new Error('Use Latin characters in drawing names before exporting PDF.');

  return text;
}

function pdfContent(doc: DrawingDocument) {
  const xy = (p: number[]) => `${pdfNumber(p[0] * PT)} ${pdfNumber((210 - p[1]) * PT)}`;
  const lines = doc.lines.map(
    (line) => `${line.hidden ? '[5.6693 2.8346]' : '[]'} 0 d ${xy(line.a)} m ${xy(line.b)} l S`,
  );
  const texts = doc.texts.map(
    ({ at, text, size }) =>
      `BT /F1 ${pdfNumber(size * PT)} Tf 1 0 0 1 ${xy(at)} Tm ${pdfString(latinText(text))} Tj ET`,
  );

  return `0 G 0 g 0.5669 w\n${lines.join('\n')}\n${texts.join('\n')}`;
}

export function drawingPdf(documents: DrawingDocument[]): Uint8Array {
  const writer = new PdfWriter();
  const root = writer.reserve();
  const pages = writer.reserve();
  const font = writer.add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  const ids = documents.map((doc) => {
    const stream = writer.add(pdfStream('', pdfContent(doc)));

    return writer.add(
      `<< /Type /Page /Parent ${ref(pages)} /MediaBox [0 0 841.8898 595.2756] /Resources << /Font << /F1 ${ref(font)} >> >> /Contents ${ref(stream)} >>`,
    );
  });

  writer.set(pages, `<< /Type /Pages /Count ${ids.length} /Kids [${ids.map(ref).join(' ')}] >>`);
  writer.set(root, `<< /Type /Catalog /Pages ${ref(pages)} >>`);

  return writer.bytes(root);
}
