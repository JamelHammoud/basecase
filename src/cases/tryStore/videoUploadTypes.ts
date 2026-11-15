export interface TryVideoUpload {
  id: string;
  camera: string;
  bytes: Uint8Array;
}

export interface VideoUploadBatch {
  videos: TryVideoUpload[];
  web: boolean;
  baseUrl: string;
}
