import type { ElectronApi } from './types';

const BRIDGE = '/api/bridge';

export const electron = (): ElectronApi | undefined => window.electronAPI;

export async function get<T>(path: string): Promise<T> {
  return (await fetch(`${BRIDGE}${path}`)).json();
}

export async function post<T>(path: string, body: unknown, options: { json?: boolean } = {}): Promise<T> {
  const headers = options.json === false ? undefined : { 'Content-Type': 'application/json' };
  const res = await fetch(`${BRIDGE}${path}`, { method: 'POST', headers, body: JSON.stringify(body) });

  return res.json();
}

export async function postJson<T>(path: string, json: string): Promise<T> {
  const res = await fetch(`${BRIDGE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: json,
  });

  return res.json();
}

export async function postOrThrow<T>(
  path: string,
  body: unknown,
  failure: (parsed: { error?: unknown }, res: Response) => string | null,
): Promise<T> {
  const res = await fetch(`${BRIDGE}${path}`, {
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
