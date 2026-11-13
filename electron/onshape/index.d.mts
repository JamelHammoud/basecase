import type { ConvertedFiles, ConvertedModel } from '../../src/utils/robotImport/simready';

export interface OnshapeSecrets {
  available: () => boolean;
  encrypt: (value: string) => string;
  decrypt: (sealed: string) => string;
}

export interface OnshapeAccountOptions {
  libraryDir: string;
  secrets: OnshapeSecrets | null;
  converter: { convert: (job: { bytes: Uint8Array }) => Promise<Uint8Array> } | null;
  emit?: (event: Record<string, unknown>) => void;
  fetchImpl?: (url: string, init: never) => Promise<Response>;
  origin?: string;
  sleep?: (ms: number) => Promise<void>;
}

export const NO_KEYS: string;

export class OnshapeAccount {
  constructor(options: OnshapeAccountOptions);
  keys: { file: string };
  fetchImpl: OnshapeAccountOptions['fetchImpl'];
  account(): { access: boolean; secret: boolean; name: string | null };
  setKey(payload: { kind: 'access' | 'secret'; value: string }): Promise<ReturnType<OnshapeAccount['account']>>;
  importAssembly(payload: {
    link: string;
    requestId?: string;
  }): Promise<{ model: ConvertedModel; files: ConvertedFiles }>;
}
