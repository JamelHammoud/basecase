import { base64ToBytes, bytesToBase64 } from '../../utils/base64';
import { prepareFacility } from './facility';
import { meshBounds } from '../../cases/worldImport/geometry';
import type { FacilityOptions, FacilityGeometry } from './facilityTypes';

interface Request {
  path: string;
  operation: 'import' | 'load';
  files?: File[];
  options?: FacilityOptions;
}

async function responseJson(response: Response) {
  if (!response.ok) throw new Error('Fleet facility request refused');

  return response.json();
}

function typedGeometry(geometry: FacilityGeometry) {
  return {
    ...geometry,
    bounds: meshBounds(new Float32Array([...geometry.positions, ...geometry.lines, ...geometry.points])),
    positions: new Float32Array(geometry.positions),
    indices: new Uint32Array(geometry.indices),
    lines: new Float32Array(geometry.lines),
    points: new Float32Array(geometry.points),
  };
}

async function importFacility(request: Request) {
  if ((request.files ?? []).reduce((total, file) => total + file.size, 0) > 32 * 1024 * 1024)
    throw new Error('Choose facility files under 32 MB');

  const files = await Promise.all(
    (request.files ?? []).map(async (file) => ({ name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) })),
  );
  const encoded = files.map((file) => ({ name: file.name, base64: bytesToBase64(file.bytes) }));
  let sourceFrame: { metersPerUnit: number; up: 'Y' | 'Z' } | undefined;
  let preparation = files;
  let options = request.options!;

  if (files.some((file) => /\.(usd|usda|usdc|usdz)$/i.test(file.name))) {
    const converted = await responseJson(
      await fetch(`${request.path}/convert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files: encoded, root: request.options?.root }),
      }),
    );

    sourceFrame = { ...converted.sourceFrame, up: converted.sourceFrame.up.toUpperCase() };
    preparation = [{ name: 'facility.glb', bytes: base64ToBytes(converted.base64) }];
    options = { ...request.options, units: 'm', up: 'Z' };
  }

  const geometry = await prepareFacility(preparation, options);

  if (sourceFrame) {
    geometry.name = request.options?.root || files.find((file) => /\.(usd|usda|usdc|usdz)$/i.test(file.name))!.name;
    geometry.metersPerUnit = sourceFrame.metersPerUnit;
    geometry.up = sourceFrame.up;
  }

  const saved = await responseJson(
    await fetch(request.path, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ files: encoded, geometry, sourceFrame }),
    }),
  );

  return { ...saved, geometry: typedGeometry(geometry) };
}

async function loadFacility(path: string) {
  const saved = await responseJson(await fetch(`${path}/geometry`));

  return { ...saved, geometry: saved.geometry ? typedGeometry(saved.geometry) : null };
}

self.onmessage = async (event: MessageEvent<Request>) => {
  try {
    const request = event.data;
    const result = request.operation === 'import' ? await importFacility(request) : await loadFacility(request.path);
    const geometry = result.geometry;

    self.postMessage(
      { result },
      {
        transfer: geometry
          ? [geometry.positions.buffer, geometry.indices.buffer, geometry.lines.buffer, geometry.points.buffer]
          : [],
      },
    );
  } catch {
    self.postMessage({ error: 'Fleet facility request refused' });
  }
};
