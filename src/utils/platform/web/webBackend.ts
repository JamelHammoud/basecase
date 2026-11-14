import type { AcpStatusInfo, CustomModelDefinition, Purchases, StoredPurchase } from '../../../types/robotics';
import { checkedPrice, isOnHandCount } from '../../onHand';
import type { TrainerStatus } from '../types';
import { idbAll, idbDelete, idbGet, idbPut } from './idb';
import { trainedPolicy, trainedSkill } from './webTrained';
import { deleteScene, getScene, listScenes, saveScene, saveScenePreview } from './webScenes';
import { getSkill, saveSkill } from './webSkills';
import { errorMessage } from '../../errorMessage';
import { newestModelFirst } from '../../modelList';

type Body = Record<string, unknown>;

type Route = (body: Body, params: URLSearchParams) => unknown;

export const WEB_AGENT_STATUS: AcpStatusInfo = {
  connected: false,
  sessionId: null,
  agentName: 'Claude Code',
  agentCommand: '',
};

const TRAINER: TrainerStatus = { uv: false, ready: false, running: [], desktopOnly: true };

const OK = { ok: true };

const listModels = async () => (await idbAll<CustomModelDefinition>('models')).sort(newestModelFirst);

async function saveModel(model: CustomModelDefinition) {
  const record = {
    ...model,
    id: model.id || `model-${Date.now().toString(36)}`,
    createdAt: model.createdAt || new Date().toISOString(),
  };

  await idbPut('models', record.id, record);

  return record;
}

async function deleteModel(id: string) {
  await idbDelete('models', id);

  return OK;
}

const listPurchases = async () => (await idbGet<Purchases>('settings', 'purchases')) ?? {};

function storedRecord(record: StoredPurchase): StoredPurchase {
  if (record.onHand !== undefined && !isOnHandCount(record.onHand)) throw new Error('On hand must be a whole count');

  const price = checkedPrice(record);

  return price
    ? { ...price, checkedAt: price.checkedAt || new Date().toLocaleDateString('en-CA') }
    : { onHand: record.onHand ?? 0 };
}

async function savePurchase({ key, record }: { key: string; record: StoredPurchase | null }) {
  const all = await listPurchases();

  if (record) all[key] = storedRecord(record);
  else delete all[key];

  await idbPut('settings', 'purchases', all);

  return all;
}

const uploadedImage = (body: Body) => ({
  id: `img-${Date.now().toString(36)}`,
  name: String(body.name ?? 'image'),
  filePath: '',
  dataUrl: String(body.dataUrl ?? ''),
  uploadedAt: new Date().toISOString(),
  width: body.width,
  height: body.height,
});

const ROUTES: Record<string, Route> = {
  'acp-status': () => WEB_AGENT_STATUS,
  'sourced-parts': () => [],
  'sourced-mesh': () => ({ data: null }),
  'acp-live-runs': () => [],
  'acp-steer': () => ({ outcome: 'unsupported' }),
  'acp-cancel': () => OK,
  'acp-close-workspace': () => OK,
  'acp-forget-run': () => OK,
  'cad-render': () => ({ ok: false, error: 'Download Basecase to compile parts.' }),
  'agent-respond': () => OK,
  chats: () => [],
  chat: () => null,
  'chat-save': () => [],
  'chat-delete': () => [],
  images: () => [],
  'upload-image': uploadedImage,
  models: listModels,
  'save-model': (b) => saveModel(b as unknown as CustomModelDefinition),
  'delete-model': (b) => deleteModel(String(b.modelId)),
  purchases: listPurchases,
  'purchase-save': (b) => savePurchase(b as { key: string; record: StoredPurchase | null }),
  scenes: listScenes,
  scene: (_, params) => getScene(params.get('id') ?? ''),
  'save-scene': (b) => saveScene(b),
  'save-scene-preview': (b) => saveScenePreview(b as { id: string }),
  'delete-scene': (b) => deleteScene(String(b.sceneId)),
  'train-status': () => TRAINER,
  policy: (_, params) => trainedPolicy(params.get('id') ?? ''),
  'policy-delete': () => false,
  skill: async (_, params) => (await getSkill(params.get('hash'))) ?? trainedSkill(params.get('hash') ?? ''),
  'skill-save': (b) => saveSkill(b),
  snapshot: () => null,
  'snapshot-keep': () => [],
  'simready-status': () => ({ uv: false, ready: false }),
  'simready-file': () => ({ data: null }),
  'print-status': () => ({ slicers: [], downloads: {}, bambuConnect: false }),
  'print-printers': () => [],
  'print-save-printers': () => [],
  'print-discover': () => [],
  'print-last-slice': () => null,
  'print-printer-status': () => null,
};

const DESKTOP_ONLY: Array<[string, string]> = [
  ['acp-', 'Download Basecase to use the agent.'],
  ['simready-', 'Download Basecase to insert SimReady models.'],
  ['train-', 'Download Basecase to train policies.'],
  ['print-', 'Download Basecase to slice and print.'],
];

const desktopOnly = (name: string) =>
  DESKTOP_ONLY.find(([prefix]) => name.startsWith(prefix))?.[1] ?? 'Download Basecase to use this.';

const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value ?? null), { status, headers: { 'Content-Type': 'application/json' } });

const parsed = (body: BodyInit | null | undefined): Body => (typeof body === 'string' && body ? JSON.parse(body) : {});

export async function webRequest(path: string, init?: RequestInit): Promise<Response> {
  const url = new URL(path, 'http://web');
  const name = url.pathname.replace(/^\//, '');
  const route = ROUTES[name];

  if (!route) return json({ error: desktopOnly(name) }, 501);

  try {
    return json(await route(parsed(init?.body), url.searchParams));
  } catch (e) {
    return json({ error: errorMessage(e) }, 500);
  }
}

export const webGuides = {
  save: async ({ id, html }: { id: string; html: string }) => {
    await idbPut('guides', id, html);

    return { ok: true };
  },
  exists: async (id: string) => Boolean(await idbGet('guides', id)),
  html: async (id: string) => (await idbGet<string>('guides', id)) ?? null,
};
