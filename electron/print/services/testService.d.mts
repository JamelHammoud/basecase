export interface FakeSlantRequest {
  method: string;
  path: string;
  auth: string | undefined;
  body: Buffer;
}

export interface FakeSlant {
  origin: string;
  state: { requests: FakeSlantRequest[]; estimates: Array<{ id: string; filamentId: string; quantity: number }> };
  close: () => Promise<void>;
}

export const FAKE_BUILD_MM: number;
export function fakeUnitUsd(size: [number, number, number]): number;
export function startFakeSlant(options: {
  key: string;
  port?: number;
  override?: (record: FakeSlantRequest) => [number, unknown] | undefined;
}): Promise<FakeSlant>;
