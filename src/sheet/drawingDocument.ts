import { drawingHeader } from './drawingText';
import type { DrawingManifest, DrawingPoint, DrawingSheet } from './drawingTypes';

export interface DocumentLine {
  a: DrawingPoint;
  b: DrawingPoint;
  hidden?: boolean;
}

export interface DocumentText {
  at: DrawingPoint;
  text: string;
  size: number;
}

export interface DrawingDocument {
  lines: DocumentLine[];
  texts: DocumentText[];
}

export const drawingNumber = (n: number) => Number(n.toFixed(4)).toString();

function dimension(doc: DrawingDocument, a: DrawingPoint, b: DrawingPoint, text: string) {
  doc.lines.push({ a, b });

  for (const p of [a, b]) doc.lines.push({ a: [p[0] - 1, p[1] - 1], b: [p[0] + 1, p[1] + 1] });

  doc.texts.push({ at: [(a[0] + b[0]) / 2 + 1, (a[1] + b[1]) / 2 - 1], text, size: 3 });
}

function sheetViews(doc: DrawingDocument, sheet: DrawingSheet, top: number) {
  const [width, height, depth] = sheet.extents.map((n) => n * sheet.scale);
  const fronts: Record<string, DrawingPoint> = {
    front: [22, top + depth + 18 + height],
    top: [22, top + depth],
    right: [22 + width + 22, top + depth + 18 + height],
  };
  const occupiedHeight = top + depth + 18 + height;

  if (width + depth + 66 > 282 || occupiedHeight > 158)
    throw new Error(`${sheet.name}: choose a smaller scale to fit the drawing on A4.`);

  for (const view of sheet.views) {
    const origin = fronts[view.name];
    const position = ([x, y]: DrawingPoint): DrawingPoint => [origin[0] + x * sheet.scale, origin[1] - y * sheet.scale];

    doc.lines.push(...view.lines.map((line) => ({ a: position(line.a), b: position(line.b), hidden: line.hidden })));
    doc.texts.push({ at: [origin[0], origin[1] + 6], text: view.name, size: 3 });
  }

  sheet.holes.forEach((hole, index) =>
    doc.texts.push({
      at: [22 + hole.center[0] * sheet.scale + 1, occupiedHeight - hole.center[1] * sheet.scale - 1],
      text: `H${index + 1}`,
      size: 2.5,
    }),
  );
  doc.texts.push({ at: [18, occupiedHeight + 4], text: '0', size: 3 });

  const bottom = occupiedHeight + 12;

  dimension(doc, [22, bottom], [22 + width, bottom], `~${drawingNumber(sheet.extents[0])}`);
  dimension(doc, [12, occupiedHeight], [12, occupiedHeight - height], `~${drawingNumber(sheet.extents[1])}`);
  dimension(doc, [22 + width + 22, bottom], [22 + width + 22 + depth, bottom], `~${drawingNumber(sheet.extents[2])}`);
}

export function drawingDocument(sheet: DrawingSheet, manifest: DrawingManifest): DrawingDocument {
  const doc: DrawingDocument = { lines: [], texts: [] };
  const title = `${sheet.name}    Qty ${sheet.quantity}    mm    Scale ${drawingNumber(sheet.scale)}:1`;
  const axes = { xy: ['X', 'Y', 'Z'], xz: ['X', '-Z', 'Y'], yz: ['Y', 'Z', 'X'] }[sheet.frame.plane];
  const details = [
    title,
    `${manifest.source.name}    ${manifest.source.id}    ${manifest.source.fingerprint}`,
    `SHA-256 ${sheet.geometryFingerprint}`,
    `Projection X=${axes[0]}, Y=${axes[1]}, Z=${axes[2]}`,
    `${sheet.frame.frame} ${sheet.frame.plane.toUpperCase()}    Third-angle    Datum: minimum X, Y, Z of prepared geometry`,
  ];

  const header = drawingHeader(details.map((text, index) => ({ text, size: index ? 2.5 : 3.5 })));

  doc.texts.push(...header.texts);
  sheetViews(doc, sheet, Math.max(38, header.bottom + 8));

  const footer = [
    `Geometry: ${sheet.geometryFile}`,
    sheet.mode === 'profile' ? 'Measured profile' : 'Outline only: feature dimensions omitted',
    sheet.material ? `Material: ${sheet.material}` : 'Material: unspecified',
    `Numerical tolerance ${manifest.numericalToleranceMm} mm. Circle chord allowance ${manifest.circleChordToleranceMm} mm.`,
    manifest.tolerances
      ? 'Measured mesh dimensions use ~. Authored manufacturing declarations are in drawings.json.'
      : 'Measured mesh dimensions use ~. No fits, process tolerances or finish specified.',
    'Print at actual size. Checks supplies the Ready to build verdict.',
  ];

  footer.forEach((text, index) => doc.texts.push({ at: [12, 178 + index * 4.5], text, size: 2.5 }));

  return doc;
}

export function holeDocuments(sheet: DrawingSheet, manifest: DrawingManifest): DrawingDocument[] {
  if (!sheet.holes.length && !sheet.edges?.length) return [];

  const rows = sheet.holes.map((hole, index) =>
    [`H${index + 1}`, `~${drawingNumber(hole.diameterMm)}`, ...hole.center.map(drawingNumber)].join('    '),
  );

  rows.push(
    ...(sheet.edges ?? []).map(
      (edge, index) =>
        `E${index + 1}    ~${drawingNumber(edge.lengthMm)}    (${edge.a.map(drawingNumber).join(', ')}) to (${edge.b.map(drawingNumber).join(', ')})`,
    ),
  );

  const documents: DrawingDocument[] = [];

  const header = drawingHeader([
    { text: `${sheet.name}    ${manifest.source.id}    Profile features from datum, mm`, size: 3.5 },
    { text: `SHA-256 ${sheet.geometryFingerprint}`, size: 2.5 },
    { text: 'Hole    Measured diameter    X    Y. Edge    Length    Endpoints.', size: 3 },
  ]);
  const firstRow = header.bottom + 5;
  const pageRows = Math.floor((176 - firstRow) / 5);

  for (let start = 0; start < rows.length; start += pageRows) {
    const texts: DocumentText[] = [
      ...header.texts,
      ...rows
        .slice(start, start + pageRows)
        .map((text, i) => ({ at: [12, firstRow + i * 5] as DrawingPoint, text, size: 3 })),
      {
        at: [12, 187],
        text: `Through holes. ~ denotes a polygonal circle fit. Omitted hole dimensions: ${sheet.omittedHoleDimensions ?? 0}.`,
        size: 3,
      },
    ];

    documents.push({ lines: [], texts });
  }

  return documents;
}
