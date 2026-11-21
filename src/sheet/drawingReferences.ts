import { drawingHeader, drawingTextLines } from './drawingText';
import type { DrawingDocument } from './drawingDocument';
import type { DrawingManifest } from './drawingTypes';

export function drawingReferences(manifest: DrawingManifest): DrawingDocument[] {
  const rows = manifest.references
    .flatMap(({ partId, key, identity }) => [
      `${partId}    ${key}`,
      [identity?.manufacturer, identity?.mpn, identity?.supplier, identity?.supplierPartNumber]
        .filter(Boolean)
        .join('    '),
      identity?.sourceUrl ?? '',
    ])
    .flatMap((text) => drawingTextLines(text, 2.5));
  const documents: DrawingDocument[] = [];
  const header = drawingHeader([
    { text: `${manifest.source.name}    Supplier references`, size: 3.5 },
    { text: manifest.source.id, size: 3 },
  ]);
  const firstRow = header.bottom + 6;
  const pageRows = Math.floor((186 - firstRow) / 6);

  for (let start = 0; start < rows.length; start += pageRows) {
    documents.push({
      lines: [],
      texts: [
        ...header.texts,
        ...rows
          .slice(start, start + pageRows)
          .map((text, index) => ({ at: [12, firstRow + index * 6] as [number, number], text, size: 2.5 })),
      ],
    });
  }

  return documents;
}
