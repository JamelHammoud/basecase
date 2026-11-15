export interface RoboflowSecretStorage {
  available: () => boolean;
  encrypt: (value: string) => string;
  decrypt: (value: string) => string;
}

export interface RoboflowAccountState {
  saved: boolean;
}

export interface RoboflowArchive {
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
  importProject(link: unknown): Promise<RoboflowArchive>;
}
