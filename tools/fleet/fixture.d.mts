import type { IncomingMessage, ServerResponse } from 'node:http';

export interface FleetResource {
  id: string;
  name: string;
  parent: string | null;
  attributes: Record<string, string>;
  status: string;
  generation: number;
  observedAt: string | null;
  stale: boolean;
}

export interface FleetClient {
  org: string;
  id: string;
  token: string;
  credential: string;
  email: string;
  call(method: string, suffix: string, body?: unknown, org?: string): Promise<Response>;

  result<T = FleetResource>(method: string, suffix: string, body?: unknown): Promise<T>;

  create(kind: string, body: unknown): Promise<FleetResource>;

  update(kind: string, id: string, body: unknown): Promise<FleetResource>;

  remove(kind: string, id: string): Promise<unknown>;

  list(kind: string, after?: string): Promise<{ items: FleetResource[]; next: string | null }>;

  generation(id: string): Promise<number>;

  publish(updates: unknown[]): Promise<{ accepted: number }>;

  service(rules: unknown[]): Promise<FleetClient>;

  enroll(email: string, roles: string[]): Promise<FleetClient>;
}

export interface FleetFixture {
  origin: string;
  databaseUrl: string;
  readonly pool: { query(text: string, values?: unknown[]): Promise<unknown> };
  bootstrap(name: string): Promise<FleetClient>;

  restart(): Promise<void>;

  close(): Promise<void>;
}

export function fleetFixture(options?: {
  assets?: (request: IncomingMessage, response: ServerResponse, url: URL) => Promise<void>;
}): Promise<FleetFixture>;
