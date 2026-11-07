import type { AcpStatusInfo, CustomModelDefinition, PurchaseRecord } from '../../../types/robotics';
import type { TrainerStatus } from '../types';
import { idbAll, idbDelete, idbGet, idbPut } from './idb';
import { deleteScene, getScene, listScenes, saveScene, saveScenePreview } from './webScenes';

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

const newestModel = (a: CustomModelDefinition, b: CustomModelDefinition) =>
  (b.createdAt || '').localeCompare(a.createdAt || '');

const listModels = async () => (await idbAll<CustomModelDefinition>('models')).sort(newestModel);

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

  return listModels();
}

const listPurchases = async () => (await idbGet<Record<string, PurchaseRecord>>('settings', 'purchases')) ?? {};

async function savePurchase({ key, record }: { key: string; record: PurchaseRecord | null }) {
  const all = await listPurchases();

  if (record) all[key] = { ...record, checkedAt: record.checkedAt || new Date().toLocaleDateString('en-CA') };
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
  'purchase-save': (b) => savePurchase(b as { key: string; record: PurchaseRecord | null }),
  scenes: listScenes,
  scene: (_, params) => getScene(params.get('id') ?? ''),
  'save-scene': (b) => saveScene(b),
  'save-scene-preview': (b) => saveScenePreview(b as { id: string }),
  'delete-scene': (b) => deleteScene(String(b.sceneId)),
  'train-status': () => TRAINER,
  policy: () => null,
  'policy-delete': () => false,
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
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
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
