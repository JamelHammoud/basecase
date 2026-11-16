export interface LocalIdp {
  issuer: string;
  entryPoint: string;
  key: { publicKey: string; privateKey: string };
  close(): Promise<void>;
}

export function localIdp(): Promise<LocalIdp>;
