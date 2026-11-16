import { parentPort, workerData } from 'node:worker_threads';
import { createHash } from 'node:crypto';
import { checkedPackage, convertLocalFacility } from '../../../electron/simready/localFacility.mjs';
import { checkedRegistration } from '../sites/registration.mjs';

const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');

function checkedGeometry(geometry) {
  if (!geometry || !['Y', 'Z'].includes(geometry.up) || !(geometry.metersPerUnit > 0 && geometry.metersPerUnit <= 1000))
    throw new Error('Declare facility units and up axis');

  checkArrays(geometry);

  if (!geometry.positions.length && !geometry.lines.length && !geometry.points.length)
    throw new Error('Include facility geometry');

  if (
    geometry.lines.length % 6 ||
    geometry.indices.some((n) => !Number.isSafeInteger(n) || n < 0 || n >= geometry.positions.length / 3)
  )
    throw new Error('Check facility geometry indices');

  if (
    !Array.isArray(geometry.floors) ||
    geometry.floors.length > 128 ||
    geometry.floors.some((name) => typeof name !== 'string' || name.length > 200)
  )
    throw new Error('Choose up to 128 facility floors');

  checkName(geometry.name);

  return {
    name: geometry.name,
    metersPerUnit: geometry.metersPerUnit,
    up: geometry.up,
    positions: geometry.positions,
    indices: geometry.indices,
    lines: geometry.lines,
    points: geometry.points,
    floors: [...new Set(geometry.floors)],
  };
}

async function prepare() {
  const started = performance.now();
  const body = JSON.parse(Buffer.from(workerData.bytes).toString('utf8'));

  if (workerData.mode === 'registration') return prepareRegistration(body);

  const files = checkedPackage(body.files);
  const sources = files.map((file) => ({ name: file.name, bytes: file.bytes.length, hash: digest(file.bytes) }));

  if (workerData.mode === 'convert')
    return { encoded: JSON.stringify({ ...(await convertLocalFacility(body.files, { root: body.root })), sources }) };

  const geometry = checkedGeometry(body.geometry);
  const content = JSON.stringify({ ...geometry, sources });
  const hash = digest(content);
  const summary = {
    name: geometry.name,
    hash,
    sources,
    metersPerUnit: geometry.metersPerUnit,
    up: geometry.up,
    sourceFrame: checkedSourceFrame(body.sourceFrame, geometry),
    floors: geometry.floors,
    preparation: {
      elapsedMs: performance.now() - started,
      workerHeapBytes: process.memoryUsage().heapUsed,
      sourceBytes: files.reduce((sum, file) => sum + file.bytes.length, 0),
      geometryBytes: Buffer.byteLength(content),
      workers: 1,
    },
  };

  return { content, hash, summary, source: workerData.bytes };
}

prepare()
  .then((result) => parentPort.postMessage({ result }))
  .catch(() => parentPort.postMessage({ error: 'Fleet facility request refused' }));

function checkArrays(geometry) {
  for (const [key, maximum] of [
    ['positions', 1800000],
    ['indices', 600000],
    ['lines', 1200000],
    ['points', 3000000],
  ]) {
    const values = geometry[key];

    if (!Array.isArray(values) || values.length > maximum || values.length % 3 || !values.every(Number.isFinite))
      throw new Error('Choose a smaller facility');

    if (key !== 'indices' && values.some((v) => Math.abs(v) > 100000))
      throw new Error('Facility coordinates exceed 100 km');
  }
}

function checkedSourceFrame(value, geometry) {
  if (!value) return null;

  if (
    value.metersPerUnit !== geometry.metersPerUnit ||
    value.up !== geometry.up ||
    typeof value.authoredUnits !== 'boolean'
  )
    throw new Error('Declare matching source units and axes');

  return { metersPerUnit: value.metersPerUnit, up: value.up, authoredUnits: value.authoredUnits };
}

function checkName(name) {
  if (typeof name !== 'string' || !name.length || name.length > 240) throw new Error('Name the facility file');
}

function prepareRegistration(body) {
  const registration = checkedRegistration(body);

  if (typeof body.facility !== 'string' || !/^[0-9a-f]{64}$/.test(body.facility))
    throw new Error('Declare the facility source hash');

  return { registration, facility: body.facility };
}
