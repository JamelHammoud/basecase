const DXF_UNITS: Record<number, number> = { 1: 0.0254, 2: 0.3048, 4: 0.001, 5: 0.01, 6: 1 };

export function readFloorplan(bytes: Uint8Array) {
  const text = new TextDecoder().decode(bytes);
  const rows = text.split(/\r?\n/);
  const pairs: [number, string][] = [];

  if (text.startsWith('AutoCAD Binary DXF')) throw new Error('Export an ASCII DXF floorplan');

  for (let i = 0; i + 1 < rows.length; i += 2) pairs.push([Number(rows[i].trim()), rows[i + 1].trim()]);

  const headerIndex = pairs.findIndex(([code, value]) => code === 9 && value === '$INSUNITS');
  const units = headerIndex < 0 ? null : DXF_UNITS[Number(pairs[headerIndex + 1]?.[1])];
  const lines: number[] = [];
  const floors = new Set<string>();
  let entity: [number, string][] = [];
  let inEntities = false;

  for (const pair of pairs) {
    if (pair[0] === 2 && pair[1] === 'ENTITIES') inEntities = true;

    if (pair[0] !== 0) {
      entity.push(pair);

      continue;
    }

    if (inEntities) appendEntity(entity, lines, floors);

    if (pair[1] === 'ENDSEC') inEntities = false;

    entity = [pair];
  }

  if (!lines.length) throw new Error('Export DXF lines or lightweight polylines');

  return { lines, floors: [...floors], units };
}

function appendEntity(entity: [number, string][], lines: number[], floors: Set<string>) {
  const kind = entity[0]?.[1];
  const get = (code: number, fallback = 0) => Number(entity.find(([key]) => key === code)?.[1] ?? fallback);
  const layer = entity.find(([code]) => code === 8)?.[1] ?? '0';

  if (kind && !['SECTION', 'LINE', 'LWPOLYLINE', 'ENDSEC'].includes(kind))
    throw new Error('Export DXF lines or lightweight polylines');

  if (Math.abs(get(210)) + Math.abs(get(220)) + Math.abs(get(230, 1) - 1) > 1e-9)
    throw new Error('Flatten DXF entity axes before importing');

  if (['INSERT', 'XREF', 'IMAGE', 'UNDERLAY'].includes(kind))
    throw new Error('Flatten DXF references before importing');

  if (kind === 'LINE') lines.push(get(10), get(20), get(30), get(11), get(21), get(31));

  if (kind === 'LWPOLYLINE') appendPolyline(entity, lines, get(38), Boolean(get(70) & 1));

  if (kind === 'LINE' || kind === 'LWPOLYLINE') floors.add(layer);

  if (lines.length > 1200000 || floors.size > 128) throw new Error('Choose a smaller floorplan');
}

function appendPolyline(entity: [number, string][], lines: number[], elevation: number, closed: boolean) {
  if (entity.some(([code, value]) => code === 42 && Number(value) !== 0))
    throw new Error('Flatten curved DXF polylines before importing');

  const vertices: number[][] = [];

  for (const [code, value] of entity) {
    if (code === 10) vertices.push([Number(value), 0, elevation]);

    if (code === 20 && vertices.length) vertices.at(-1)![1] = Number(value);
  }

  for (let i = 1; i < vertices.length; i++) lines.push(...vertices[i - 1], ...vertices[i]);

  if (closed && vertices.length > 1) lines.push(...vertices.at(-1)!, ...vertices[0]);
}
