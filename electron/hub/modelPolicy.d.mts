export interface ModelRef {
  owner: string;
  repo: string;
  revision: string;
  path: string;
  sha256: string;
  maxBytes: number;
}
export declare const MODEL_FILE_BYTES: number;
export declare function checkedModelRef(value: unknown): ModelRef;
export declare function modelResolvePath(value: ModelRef): string;

export declare const MODEL_ASSET_PREFIX: string;
export declare function modelAssetPath(sha256: string): string;
