import { assemblyModel } from './assembly.mjs';
import { isId } from './link.mjs';
import { mateLimits } from './mates.mjs';
import { occurrencesOf, partKey, uniqueParts } from './occurrences.mjs';
import { partMesh } from './partMesh.mjs';

const API = '/api/v10';
const MAX_STEP_BYTES = 200_000_000;
const POLL_MS = 1000;
const MAX_POLLS = 180;
const WORKERS = 4;
const TRIANGLE_BUDGET = 600_000;
const MIN_PART_TRIANGLES = 2000;

const checkedId = (value, what) => {
  if (!isId(value)) throw new Error(`Onshape sent a malformed ${what}.`);

  return value;
};

function studioOf(doc, { instance, name }) {
  if (instance.documentId === doc.did) return { did: doc.did, wv: doc.wvm, wvid: doc.wvmid };

  if (instance.documentVersion) return { did: instance.documentId, wv: 'v', wvid: instance.documentVersion };

  throw new Error(`Couldn’t export ${name} from its linked document.`);
}

async function exportStep(job, part) {
  const { client, doc, sleep } = job;
  const { did, wv, wvid } = studioOf(doc, part);
  const { instance } = part;
  let state = await client.json(`${API}/partstudios/d/${did}/${wv}/${wvid}/e/${instance.elementId}/translations`, {
    method: 'POST',
    body: {
      formatName: 'STEP',
      partIds: instance.partId,
      configuration: instance.configuration ?? '',
      storeInDocument: false,
    },
  });

  for (let n = 0; state?.requestState === 'ACTIVE' && n < MAX_POLLS; n++) {
    await sleep(POLL_MS);
    state = await client.json(`${API}/translations/${checkedId(state.id, 'export')}`);
  }

  if (state?.requestState !== 'DONE') throw new Error(`Onshape couldn’t export ${part.name} as STEP.`);

  const file = checkedId(state.resultExternalDataIds?.[0], 'export');

  return client.bytes(`${API}/documents/d/${did}/externaldata/${file}`, MAX_STEP_BYTES);
}

function weighed(body) {
  const mass = body?.mass?.[0];
  const centroid = Array.isArray(body?.centroid) ? body.centroid.slice(0, 3) : [];
  const valid = body?.hasMass === true && Number.isFinite(mass) && mass > 0;

  return valid && centroid.length === 3 && centroid.every(Number.isFinite) ? { mass, centroid } : null;
}

async function massOf(client, { instance }) {
  const { documentId, documentMicroversion, elementId, partId } = instance;
  const path = `${API}/parts/d/${documentId}/m/${documentMicroversion}/e/${elementId}/partid/${partId}/massproperties`;
  const reply = await client.json(path, { query: { configuration: instance.configuration ?? '' } }).catch(() => null);

  return weighed(reply?.bodies?.[partId] ?? reply?.bodies?.['-all-']);
}

async function pool(items, run) {
  const queue = [...items.entries()];
  const worker = async () => {
    for (let next = queue.shift(); next; next = queue.shift()) await run(next[1], next[0]);
  };

  await Promise.all(Array.from({ length: Math.min(WORKERS, items.length) }, worker));
}

async function partData(job, unique) {
  const meshes = new Map();
  const masses = new Map();
  const files = {};
  const budget = Math.max(MIN_PART_TRIANGLES, Math.floor(TRIANGLE_BUDGET / unique.length));
  let done = 0;

  await pool(unique, async (part, i) => {
    const key = partKey(part.instance);
    const [step, mass] = await Promise.all([exportStep(job, part), massOf(job.client, part)]);
    const { glb, color } = partMesh(await job.convertStep(step), budget);
    const file = `parts/${i}.glb`;

    files[file] = glb;
    meshes.set(key, { file, color });

    if (mass) masses.set(key, mass);

    done++;
    job.say(`Loading meshes ${done}/${unique.length}`);
  });

  return { meshes, masses, files };
}

export async function fetchAssembly({ client, doc, convertStep, say = () => {}, sleep }) {
  const base = `${API}/assemblies/d/${doc.did}/${doc.wvm}/${doc.wvmid}/e/${doc.eid}`;
  const [definition, features, document] = await Promise.all([
    client.json(base, { query: { includeMateFeatures: true, includeNonSolids: false, includeMateConnectors: false } }),
    client.json(`${base}/features`),
    client.json(`${API}/documents/${doc.did}`).catch(() => null),
  ]);
  const occurrences = occurrencesOf(definition);
  const job = { client, doc, convertStep, say, sleep };
  const { meshes, masses, files } = await partData(job, [...uniqueParts(occurrences.parts).values()]);
  const name = String(document?.name ?? 'Onshape robot').slice(0, 120);
  const model = assemblyModel({ name, occurrences, limits: mateLimits(features), masses, meshes });

  return { model, files };
}
