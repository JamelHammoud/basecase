export const OBJ_MODEL = `mtllib colors.mtl
o Left
v 0 0 0
v 10 0 0
v 0 10 10
usemtl Red
f 1 2 3
o Right
v 30 0 0
v 40 0 0
v 30 10 10
usemtl Green
f 4 5 6
`;

export const OBJ_MATERIALS = 'newmtl Red\nKd 1 0 0\nnewmtl Green\nKd 0 1 0\n';

export function glbModel(triangles = 1): Uint8Array<ArrayBuffer> {
  const positions = new Float32Array([0, 0, 0, 0.01, 0, 0, 0, 0.01, 0.01]);
  const indices = new Uint32Array(triangles * 3);

  for (let i = 0; i < indices.length; i++) indices[i] = i % 3;

  const document = {
    asset: { version: '2.0' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [
      { name: 'Assembly', translation: [0.1, 0.2, 0.3], children: [1, 2] },
      { name: 'Left', mesh: 0 },
      { name: 'Right', mesh: 1, translation: [0.03, 0, 0] },
    ],
    meshes: [0, 1].map((material) => ({ primitives: [{ attributes: { POSITION: 0 }, indices: 1, material }] })),
    materials: [
      [1, 0, 0, 1],
      [0, 1, 0, 1],
    ].map((baseColorFactor) => ({ pbrMetallicRoughness: { baseColorFactor } })),
    buffers: [{ byteLength: positions.byteLength + indices.byteLength }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: positions.byteLength },
      { buffer: 0, byteOffset: positions.byteLength, byteLength: indices.byteLength },
    ],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 3, type: 'VEC3', min: [0, 0, 0], max: [0.01, 0.01, 0.01] },
      { bufferView: 1, componentType: 5125, count: indices.length, type: 'SCALAR' },
    ],
  };
  const json = new TextEncoder().encode(JSON.stringify(document));
  const padded = Math.ceil(json.length / 4) * 4;
  const binLength = positions.byteLength + indices.byteLength;
  const bytes = new Uint8Array(28 + padded + binLength);
  const view = new DataView(bytes.buffer);

  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, bytes.length, true);
  view.setUint32(12, padded, true);
  view.setUint32(16, 0x4e4f534a, true);
  bytes.fill(32, 20, 20 + padded);
  bytes.set(json, 20);
  view.setUint32(20 + padded, binLength, true);
  view.setUint32(24 + padded, 0x004e4942, true);
  bytes.set(new Uint8Array(positions.buffer), 28 + padded);
  bytes.set(new Uint8Array(indices.buffer), 28 + padded + positions.byteLength);

  return bytes;
}

export function fbxModel(): string {
  const lines = [
    '; FBX 7.4.0 project file',
    'FBXHeaderExtension:  {',
    '\tFBXVersion: 7400',
    '}',
    'GlobalSettings:  {',
    '\tProperties70:  {',
    '\t\tP: "UnitScaleFactor", "double", "Number", "",1',
    '\t}',
    '}',
    'Objects:  {',
  ];

  for (let i = 0; i < 2; i++) {
    lines.push(
      `\tGeometry: ${100 + i}, "Geometry::Piece${i}", "Mesh" {`,
      '\t\tVertices: *9 {',
      '\t\t\ta: 0,0,0,1,0,0,0,1,1',
      '\t\t}',
      '\t\tPolygonVertexIndex: *3 {',
      '\t\t\ta: 0,1,-3',
      '\t\t}',
      '\t}',
      `\tModel: ${200 + i}, "Model::${i ? 'Right' : 'Left'}", "Mesh" {`,
      '\t\tProperties70:  {',
      `\t\t\tP: "Lcl Translation", "Lcl Translation", "", "A",${i * 3},0,0`,
      '\t\t}',
      '\t}',
      `\tMaterial: ${300 + i}, "Material::Color${i}", "" {`,
      '\t\tShadingModel: "phong"',
      '\t\tProperties70:  {',
      `\t\t\tP: "DiffuseColor", "Color", "", "A",${i ? '0,1,0' : '1,0,0'}`,
      '\t\t}',
      '\t}',
    );
  }

  lines.push('}', 'Connections:  {');

  for (let i = 0; i < 2; i++)
    lines.push(`\tC: "OO",${100 + i},${200 + i}`, `\tC: "OO",${300 + i},${200 + i}`, `\tC: "OO",${200 + i},0`);

  return [...lines, '}', ''].join('\n');
}
