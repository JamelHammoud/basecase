export type ImageSourceKind = 'coco' | 'yolo' | 'voc' | 'image-parquet';

export function imageSourceKind(paths: string[]): ImageSourceKind | null {
  if (paths.some((p) => /(^|\/)basecase\/frames\.json$/.test(p))) return 'coco';

  if (paths.some((p) => /(^|\/)meta\/info\.json$/.test(p))) return null;

  if (paths.some((p) => /(^|\/)(?:[^/]*coco[^/]*|instances[^/]*|_annotations|annotations)\.json$/i.test(p)))
    return 'coco';

  if (paths.some((p) => /(^|\/)(?:data|dataset)\.ya?ml$/i.test(p))) return 'yolo';

  if (paths.some((p) => /(^|\/)Annotations\/[^/]+\.xml$/i.test(p))) return 'voc';

  return paths.some((p) => /\.parquet$/i.test(p)) ? 'image-parquet' : null;
}
