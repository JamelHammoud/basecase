import type { FleetPose, Registration } from '../sites/registration.mjs';
import type { FacilitySummary } from '../sites/facilityTypes';

export interface RegistryItem {
  id: string;
  kind?: string;
  name: string;
  parent: string | null;
  status: string;
  observedAt: string | null;
  stale: boolean;
  pose?: FleetPose & { observedAt: string; site?: string };
  registration?: Registration | null;
  facility?: (Pick<FacilitySummary, 'hash' | 'name'> & Partial<FacilitySummary>) | null;
  facilitySite?: string | null;
  work?: { current: string | null; next: string | null };
  canManage?: boolean;
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
