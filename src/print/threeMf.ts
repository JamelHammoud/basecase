import { strToU8, zipSync } from 'three/examples/jsm/libs/fflate.module.js';

export interface MeshData {
  vertices: Float32Array;
  indices: Uint32Array;
}

export interface ThreeMfObject {
  id: number;
  name: string;
  mesh: MeshData;
}

export interface ThreeMfItem {
  objectId: number;
  matrix: number[];
  plate: number;
}

export interface ThreeMfInput {
  objects: ThreeMfObject[];
  items: ThreeMfItem[];
  plates: Array<{ number: number; name: string }>;
  layout: 'grid' | 'flat';
  plateSize: [number, number];
  application?: string;
}

const PLATE_GAP = 1 / 5;
const QUANT = 1e4;

export function weld(tris: Float32Array): MeshData {
  const index = new Map<string, number>();
  const vertices: number[] = [];
  const indices = new Uint32Array(tris.length / 3);

  for (let v = 0; v < tris.length / 3; v++) {
    const [x, y, z] = [tris[v * 3], tris[v * 3 + 1], tris[v * 3 + 2]];
    const key = `${Math.round(x * QUANT)},${Math.round(y * QUANT)},${Math.round(z * QUANT)}`;
    let id = index.get(key);

    if (id === undefined) {
      id = vertices.length / 3;
      index.set(key, id);
      vertices.push(x, y, z);
    }

    indices[v] = id;
  }

  return { vertices: new Float32Array(vertices), indices: dropDegenerate(indices) };
}

function dropDegenerate(indices: Uint32Array): Uint32Array {
  const out: number[] = [];

  for (let t = 0; t < indices.length; t += 3) {
    const [a, b, c] = [indices[t], indices[t + 1], indices[t + 2]];

    if (a !== b && b !== c && a !== c) out.push(a, b, c);
  }

  return new Uint32Array(out);
}

const escapeXml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const num = (v: number) => String(Math.round(v * 1e5) / 1e5);

function meshXml(mesh: MeshData): string {
  const parts: string[] = ['<mesh><vertices>'];
  const { vertices: v, indices: t } = mesh;

  for (let i = 0; i < v.length; i += 3)
    parts.push(`<vertex x="${num(v[i])}" y="${num(v[i + 1])}" z="${num(v[i + 2])}"/>`);

  parts.push('</vertices><triangles>');

  for (let i = 0; i < t.length; i += 3) parts.push(`<triangle v1="${t[i]}" v2="${t[i + 1]}" v3="${t[i + 2]}"/>`);

  parts.push('</triangles></mesh>');

  return parts.join('');
}

export function plateOrigin(plateIndex: number, plateCount: number, [w, d]: [number, number]): [number, number] {
  const root = Math.sqrt(plateCount);
  const cols = root > Math.round(root) ? Math.round(root) + 1 : Math.round(root);
  const row = Math.floor(plateIndex / Math.max(1, cols));
  const col = plateIndex % Math.max(1, cols);

  return [col * w * (1 + PLATE_GAP), -row * d * (1 + PLATE_GAP)];
}

function transformText(m: number[], offset: [number, number]): string {
  return [m[0], m[1], m[2], m[4], m[5], m[6], m[8], m[9], m[10], m[12] + offset[0], m[13] + offset[1], m[14]]
    .map(num)
    .join(' ');
}

function modelXml(input: ThreeMfInput): string {
  const plateIndex = new Map(input.plates.map((p, i) => [p.number, i]));
  const offsetOf = (plate: number): [number, number] =>
    input.layout === 'grid' ? plateOrigin(plateIndex.get(plate) ?? 0, input.plates.length, input.plateSize) : [0, 0];
  const objects = input.objects
    .map((o) => `<object id="${o.id}" type="model" name="${escapeXml(o.name)}">${meshXml(o.mesh)}</object>`)
    .join('\n');
  const items = input.items
    .map(
      (it) =>
        `<item objectid="${it.objectId}" transform="${transformText(it.matrix, offsetOf(it.plate))}" printable="1"/>`,
    )
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02"${''}>
<metadata name="Application">${escapeXml(input.application ?? 'Basecase')}</metadata>
<resources>
${objects}
</resources>
<build>
${items}
</build>
</model>
`;
}

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>
<Default Extension="png" ContentType="image/png"/>
</Types>
`;

const RELS = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Target="/3D/3dmodel.model" Id="rel-1" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>
</Relationships>
`;

export function writeThreeMf(input: ThreeMfInput): Uint8Array {
  const files: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8(CONTENT_TYPES),
    '_rels/.rels': strToU8(RELS),
    '3D/3dmodel.model': strToU8(modelXml(input)),
  };

  return zipSync(files, { level: 6 });
}
