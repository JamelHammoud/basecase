import { bytesToBase64 } from '../../utils/base64';

export const base64Files = (files: Record<string, Uint8Array>) =>
  Object.fromEntries(Object.entries(files).map(([path, bytes]) => [path, bytesToBase64(bytes)]));
