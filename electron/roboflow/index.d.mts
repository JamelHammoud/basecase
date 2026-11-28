export interface RoboflowSecretStorage {
  available: () => boolean;
  encrypt: (value: string) => string;
  decrypt: (value: string) => string;
}

export interface RoboflowAccountState {
  saved: boolean;
}

export interface RoboflowContinuation {
  workspace: string;
  project: string;
  version: number;
  format: 'coco';
  signature: string;
}

export interface RoboflowPending {
  kind: 'pending';
  continuation: RoboflowContinuation;
  progress?: number;
}

export interface RoboflowArchive {
  kind: 'complete';
  name: string;
  data: Uint8Array;
}

export interface RoboflowAccountOptions {
  libraryDir: string;
  secrets?: RoboflowSecretStorage;
  endpoint?: () => string;
  outbound?: typeof fetch;
}

export const NO_KEY: string;
export function roboflowEndpoint(override?: string): string;

export class RoboflowAccount {
  constructor(options: RoboflowAccountOptions);
  keys: {
    file: string;
    get(kind: string): string | undefined;

    set(kind: string, value: unknown): void;
  };
  endpoint: () => string;
  outbound?: typeof fetch;
  account(): RoboflowAccountState;
  setKey(key: unknown): Promise<RoboflowAccountState>;
  response(url: URL, redirect?: RequestRedirect): Promise<Response>;
  archive(link: unknown): Promise<Uint8Array>;
  json(requestPath: string, key: string): Promise<unknown>;
  json(requestPath: string, key: string, withStatus: true): Promise<{ payload: unknown; status: number }>;
  importProject(link: unknown): Promise<RoboflowArchive | RoboflowPending>;
}
