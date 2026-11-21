import type { ElectronApi } from './types';
import { imageWorker } from '../imageEncode';
import { imageHandlers } from '../imageOps';
import { webRequest } from './web/webBackend';
import { IS_WEB_DEMO } from './webDemo';

const BRIDGE = '/api/bridge';

export const electron = (): ElectronApi | undefined => (typeof window === 'undefined' ? undefined : window.electronAPI);

const send = (path: string, init?: RequestInit): Promise<Response> =>
  IS_WEB_DEMO ? webRequest(path, init) : fetch(`${BRIDGE}${path}`, init);

export async function get<T>(path: string): Promise<T> {
  return (await send(path)).json();
}

export async function post<T>(path: string, body: unknown, options: { json?: boolean } = {}): Promise<T> {
  const headers = options.json === false ? undefined : { 'Content-Type': 'application/json' };
  const res = await send(path, { method: 'POST', headers, body: JSON.stringify(body) });

  return res.json();
}

async function jsonBody(json: string): Promise<string | Blob> {
  if (IS_WEB_DEMO) return json;

  if (typeof window === 'undefined') return imageHandlers.jsonBody(json).result;

  return imageWorker.call('jsonBody', json);
}

export async function postJson<T>(path: string, json: string): Promise<T> {
  const res = await send(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: await jsonBody(json),
  });

  return res.json();
}

export async function postOrThrow<T>(
  path: string,
  body: unknown,
  failure: (parsed: { error?: unknown }, res: Response) => string | null,
): Promise<T> {
  const res = await send(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const parsed = await res.json();
  const message = failure(parsed, res);

  if (message !== null) throw new Error(message);

  return parsed;
}

export const query = (name: string, value: string) => `?${name}=${encodeURIComponent(value)}`;

export async function quietly<T>(run: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await run();
  } catch {
    return fallback;
  }
}
