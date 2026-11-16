import { PLYLoader } from 'three/examples/jsm/loaders/PLYLoader.js';
import { droppedFiles } from '../../cases/worldImport/limits';
import { readGltf } from '../../cases/worldImport/gltf';
import { readObj } from '../../cases/worldImport/obj';
import type { WorldImportFile } from '../../cases/worldImportTypes';
import { readFloorplan } from './dxf';
import type { FacilityGeometry, FacilityOptions } from './facilityTypes';

export type { FacilityGeometry, FacilityOptions } from './facilityTypes';

async function sourceOf(file: WorldImportFile) {
  const digest = await crypto.subtle.digest('SHA-256', new Uint8Array(file.bytes));

  return {
    name: file.name,
    hash: [...new Uint8Array(digest)].map((v) => v.toString(16).padStart(2, '0')).join(''),
    bytes: file.bytes.length,
  };
}

function coordinates(values: ArrayLike<number>, scale: number, up: string) {
  const out: number[] = [];

  for (let i = 0; i < values.length; i += 3) {
    const x = values[i] * scale;
    const y = values[i + 1] * scale;
    const z = values[i + 2] * scale;

    if (![x, y, z].every(Number.isFinite) || Math.max(Math.abs(x), Math.abs(y), Math.abs(z)) > 100000)
      throw new Error('Facility coordinates exceed 100 km');

    out.push(x, up === 'Y' ? -z || 0 : y, up === 'Y' ? y : z);
  }

  return out;
}

function plyPoints(bytes: Uint8Array) {
  const prefix = new TextDecoder().decode(bytes.subarray(0, 16384));
  const count = Number(/^element vertex (\d+)/m.exec(prefix)?.[1]);

  if (!count || count > 1000000 || !prefix.includes('end_header'))
    throw new Error('Choose a PLY map with up to one million points');

  if (
    /^property list /m.test(prefix) ||
    [...prefix.matchAll(/^element (\w+)/gm)].some((match) => match[1] !== 'vertex')
  )
    throw new Error('Choose a PLY point cloud');

  const geometry = new PLYLoader().parse(new Uint8Array(bytes).buffer);
  const positions = geometry.getAttribute('position').array;
  const points = Array.from(positions);

  geometry.dispose();

  return points;
}

export async function prepareFacility(files: WorldImportFile[], options: FacilityOptions): Promise<FacilityGeometry> {
  const resources = droppedFiles(files);
  const roots = files.filter((file) => /\.(dxf|glb|gltf|obj|ply)$/i.test(file.name));
  const scale = { m: 1, mm: 0.001, cm: 0.01 }[options.units];

  if (roots.length !== 1 || !scale || !['Y', 'Z'].includes(options.up))
    throw new Error('Declare facility units and up axis');

  const file = roots[0];
  const result: FacilityGeometry = {
    name: file.name,
    metersPerUnit: scale,
    up: options.up,
    positions: [],
    indices: [],
    lines: [],
    points: [],
    floors: options.floors?.slice() ?? [],
    sources: await Promise.all(files.map(sourceOf)),
  };

  if (/\.dxf$/i.test(file.name)) {
    const floorplan = readFloorplan(file.bytes);

    requireUnits(floorplan.units, scale);

    result.lines = coordinates(floorplan.lines, scale, options.up);
    result.floors = options.floors?.length ? options.floors.slice() : floorplan.floors;

    return result;
  }

  if (/\.ply$/i.test(file.name)) {
    result.points = coordinates(plyPoints(file.bytes), scale, options.up);

    return result;
  }

  const context = { name: file.name, files: resources };
  const mesh = /\.obj$/i.test(file.name) ? readObj(file.bytes, context) : readGltf(file.bytes, context);

  if (mesh.positions.length > 1800000 || mesh.indices.length > 600000)
    throw new Error('Choose a facility with up to 200,000 triangles');

  result.positions = coordinates(mesh.positions, scale, options.up);
  result.indices = Array.from(mesh.indices);

  return result;
}

function requireUnits(declared: number | null, scale: number) {
  if (declared && Math.abs(declared - scale) > 1e-10) throw new Error('DXF units conflict with the declared units');
}
