export const SIMREADY_DATASETS: { objects: string[]; robots: string[] };
export function parseAssetUrl(url: string): {
  namespace: string;
  dataset: string;
  sha: string;
  packageName: string;
  rootPath: string;
};
export function catalogFilter(shelf: 'objects' | 'robots' | 'all'): string;
