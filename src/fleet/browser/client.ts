export interface RegistryItem {
  id: string;
  name: string;
  parent: string | null;
  status: string;
  observedAt: string | null;
  stale: boolean;
}

export interface RegistryPage {
  items: RegistryItem[];
  next: string | null;
}

export async function fleetRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`/v1/${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
  });

  if (!response.ok) throw new Error('Fleet request refused');

  return response.json();
}
