const IMAGES = [
  'iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAEElEQVR4nGP4qqEBRwzEcQAdQhRR4lrMQQAAAABJRU5ErkJggg==',
  'iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAEElEQVR4nGPQSPkKRwzEcQBlIhgRqSFD9wAAAABJRU5ErkJggg==',
];

export function cocoImportFiles(root = 'coco-mugs', names = ['mug', 'bowl']): Record<string, Uint8Array> {
  const categories = names.map((name, i) => ({ id: i + 1, name }));
  const images = IMAGES.map((_, i) => ({ id: i + 1, file_name: `object-${i + 1}.png`, width: 4, height: 4 }));
  const annotations = images.map((image) => ({
    id: image.id,
    image_id: image.id,
    category_id: image.id,
    bbox: [1, 1, 2, 2],
    area: 4,
    iscrowd: 0,
  }));

  return {
    [`${root}/train/_annotations.coco.json`]: new TextEncoder().encode(
      JSON.stringify({ images, categories, annotations }),
    ),
    ...Object.fromEntries(
      images.map((image, i) => [`${root}/train/${image.file_name}`, Buffer.from(IMAGES[i], 'base64')]),
    ),
  };
}
