import { tagCells, TAG_BORDER_CELLS, TAG_CELLS, type FloorPoint } from '../../cameras/mat/tag36h11';
import { rectCorners } from './matGrid';
import { PAPER_MM, type CaseMat, type MatSheet } from './matLayout';
import { pdfNumber, pdfNumbers, pdfStream, pdfString, PdfWriter, ref } from './pdfWriter';

export const PT_PER_MM = 72 / 25.4;

const KAPPA = 0.5522847498;
const START_LINE_PT = 1.5;
const SPOT_LINE_PT = 1;
const PATH_LINE_PT = 1;
const OUTLINE_LINE_PT = 0.5;
const GREY = 0.5;
const PATH_DASH = '[6 4] 0 d';
const CROSS_MM = 4;
const LABEL_PT = 9;
const LABEL_INSET_MM = 6;
const LABEL_DROP_MM = 9;
const FORWARD_TICK = 0.4;
const ARROW = { gapMm: 8, shaftMm: 24, shaftWidthMm: 6, headMm: 14, headWidthMm: 18 };

type Point = [number, number];

type ToPage = (p: FloorPoint) => Point;

export const sheetFrame =
  (sheet: Pick<MatSheet, 'x0' | 'z0' | 'width'>): ToPage =>
  ([x, z]) => [(sheet.x0 + sheet.width - x) * PT_PER_MM, (z - sheet.z0) * PT_PER_MM];

const tagName = (id: number) => `/T${id}`;

function rowRuns(cells: Uint8Array, row: number): string[] {
  const runs: string[] = [];
  let begin = -1;

  for (let col = 0; col <= TAG_CELLS; col++) {
    const black = col < TAG_CELLS && cells[row * TAG_CELLS + col] === 1;

    if (black && begin < 0) begin = col;

    if (black || begin < 0) continue;

    runs.push(`${begin} ${TAG_CELLS - 1 - row} ${col - begin} 1 re`);
    begin = -1;
  }

  return runs;
}

function tagForm(id: number): string {
  const cells = tagCells(id);
  const runs = Array.from({ length: TAG_CELLS }, (_, row) => rowRuns(cells, row)).flat();
  const content = `0 g\n${runs.join('\n')}\nf`;

  return pdfStream(`/Type /XObject /Subtype /Form /BBox [0 0 ${TAG_CELLS} ${TAG_CELLS}]`, content);
}

export function tagPlacement(center: Point, sizeMm: number): string {
  const cell = (sizeMm / TAG_BORDER_CELLS) * PT_PER_MM;
  const half = (cell * TAG_CELLS) / 2;

  return `${pdfNumbers(cell, 0, 0, cell, center[0] - half, center[1] - half)} cm`;
}

const polyline = (points: Point[]) =>
  points.map((p, i) => `${pdfNumbers(p[0], p[1])} ${i === 0 ? 'm' : 'l'}`).join('\n');

function circle(center: Point, radius: number): string {
  const [cx, cy] = center;
  const k = radius * KAPPA;
  const arc = (...values: number[]) => `${pdfNumbers(...values)} c`;

  return [
    `${pdfNumbers(cx + radius, cy)} m`,
    arc(cx + radius, cy + k, cx + k, cy + radius, cx, cy + radius),
    arc(cx - k, cy + radius, cx - radius, cy + k, cx - radius, cy),
    arc(cx - radius, cy - k, cx - k, cy - radius, cx, cy - radius),
    arc(cx + k, cy - radius, cx + radius, cy - k, cx + radius, cy),
    'h S',
  ].join('\n');
}

function spotOps(mat: CaseMat, page: ToPage): string[] {
  const cross = CROSS_MM * PT_PER_MM;

  return mat.spots.flatMap((s) => {
    const [cx, cy] = page(s.center);

    return [
      circle([cx, cy], s.radius * PT_PER_MM),
      `${pdfNumbers(cx - cross, cy)} m ${pdfNumbers(cx + cross, cy)} l S`,
      `${pdfNumbers(cx, cy - cross)} m ${pdfNumbers(cx, cy + cross)} l S`,
    ];
  });
}

function startOps(mat: CaseMat, page: ToPage): string[] {
  const { center, width, depth, up } = mat.start;
  const reach = Math.min(width, depth) * FORWARD_TICK;
  const tip: FloorPoint = [center[0] + up[0] * reach, center[1] + up[1] * reach];

  return [`${polyline(rectCorners(mat.start).map(page))} s`, `${polyline([page(center), page(tip)])} S`];
}

const outlineOps = (mat: CaseMat, page: ToPage): string[] =>
  mat.outlines.map((o) => `${polyline(rectCorners(o).map(page))} s`);

const pathOps = (mat: CaseMat, page: ToPage): string[] =>
  mat.path.length > 1 ? [PATH_DASH, `${polyline(mat.path.map(page))} S`, '[] 0 d'] : [];

const onSheet = (p: FloorPoint, sheet: MatSheet) =>
  p[0] >= sheet.x0 && p[0] < sheet.x0 + sheet.width && p[1] >= sheet.z0 && p[1] < sheet.z0 + sheet.height;

export function rowLetters(row: number): string {
  let letters = '';

  for (let n = row + 1; n > 0; n = Math.floor((n - 1) / 26))
    letters = String.fromCharCode(65 + ((n - 1) % 26)) + letters;

  return letters;
}

export const sheetLabel = (sheet: Pick<MatSheet, 'row' | 'column'>) => `${rowLetters(sheet.row)}${sheet.column + 1}`;

function sheetContent(mat: CaseMat, sheet: MatSheet): { content: string; tags: number[] } {
  const page = sheetFrame(sheet);
  const tags = mat.tags.filter((t) => onSheet(t.center, sheet));
  const label = [LABEL_INSET_MM, sheet.height - LABEL_DROP_MM].map((v) => v * PT_PER_MM);
  const ops = [
    `${pdfNumber(GREY)} G ${pdfNumber(OUTLINE_LINE_PT)} w`,
    ...outlineOps(mat, page),
    `${pdfNumber(PATH_LINE_PT)} w`,
    ...pathOps(mat, page),
    `0 G ${pdfNumber(SPOT_LINE_PT)} w`,
    ...spotOps(mat, page),
    `${pdfNumber(START_LINE_PT)} w`,
    ...startOps(mat, page),
    ...tags.map((t) => `q ${tagPlacement(page(t.center), t.size)} ${tagName(t.id)} Do Q`),
    `0 g BT /F1 ${LABEL_PT} Tf ${pdfNumbers(label[0], label[1])} Td ${pdfString(sheetLabel(sheet))} Tj ET`,
  ];

  return { content: ops.join('\n'), tags: tags.map((t) => t.id) };
}

function baseContent(mat: CaseMat): string {
  const paper = PAPER_MM[mat.paper];
  const [cx, cy] = [paper.width / 2, paper.height / 2];
  const shaftFrom = cy + (mat.base.size * TAG_CELLS) / TAG_BORDER_CELLS / 2 + ARROW.gapMm;
  const headFrom = shaftFrom + ARROW.shaftMm;
  const pt = (x: number, y: number): Point => [x * PT_PER_MM, y * PT_PER_MM];
  const shaft = ARROW.shaftWidthMm / 2;
  const head = ARROW.headWidthMm / 2;
  const arrow = [
    pt(cx - shaft, shaftFrom),
    pt(cx + shaft, shaftFrom),
    pt(cx + shaft, headFrom),
    pt(cx + head, headFrom),
    pt(cx, headFrom + ARROW.headMm),
    pt(cx - head, headFrom),
    pt(cx - shaft, headFrom),
  ];

  return [
    `q ${tagPlacement(pt(cx, cy), mat.base.size)} ${tagName(mat.base.id)} Do Q`,
    `0 g ${polyline(arrow)} h f`,
  ].join('\n');
}

interface PageSpec {
  content: string;
  tags: number[];
}

export function matPdf(mat: CaseMat): Uint8Array {
  const pdf = new PdfWriter();
  const catalog = pdf.reserve();
  const pages = pdf.reserve();
  const font = pdf.add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  const forms = new Map([...mat.tags.map((t) => t.id), mat.base.id].map((id) => [id, pdf.add(tagForm(id))]));
  const paper = PAPER_MM[mat.paper];
  const mediaBox = `[0 0 ${pdfNumbers(paper.width * PT_PER_MM, paper.height * PT_PER_MM)}]`;
  const sheets = [...mat.sheets].sort((a, b) => a.row - b.row || a.column - b.column);
  const specs: PageSpec[] = [
    ...sheets.map((sheet) => sheetContent(mat, sheet)),
    { content: baseContent(mat), tags: [mat.base.id] },
  ];
  const kids = specs.map(({ content, tags }) => {
    const contents = pdf.add(pdfStream('', content));
    const xobjects = tags.map((id) => `${tagName(id)} ${ref(forms.get(id)!)}`).join(' ');
    const resources = `<< /Font << /F1 ${ref(font)} >> /XObject << ${xobjects} >> >>`;

    return pdf.add(
      `<< /Type /Page /Parent ${ref(pages)} /MediaBox ${mediaBox} /Resources ${resources} /Contents ${ref(contents)} >>`,
    );
  });

  pdf.set(pages, `<< /Type /Pages /Kids [${kids.map(ref).join(' ')}] /Count ${kids.length} >>`);
  pdf.set(catalog, `<< /Type /Catalog /Pages ${ref(pages)} >>`);

  return pdf.bytes(catalog);
}
