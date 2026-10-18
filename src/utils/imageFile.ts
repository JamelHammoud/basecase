export async function readImageFile(
  file: Blob,
  maxSide = 2048,
): Promise<{ dataUrl: string; width: number; height: number }> {
  const original: string = await new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Try the file again.'));
    reader.readAsDataURL(file);
  });
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();

    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error('Use a PNG, JPEG, WebP or GIF.'));
    el.src = original;
  });
  const { naturalWidth: w, naturalHeight: h } = img;
  const scale = Math.min(1, maxSide / Math.max(w, h));

  if (scale === 1) return { dataUrl: original, width: w, height: h };

  const canvas = document.createElement('canvas');

  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);

  const type = file.type === 'image/png' ? 'image/png' : 'image/jpeg';

  return { dataUrl: canvas.toDataURL(type, 0.9), width: canvas.width, height: canvas.height };
}

export async function downscaleDataUrl(dataUrl: string, maxSide: number, quality = 0.86): Promise<string> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();

    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error('Use a PNG, JPEG, WebP or GIF.'));
    el.src = dataUrl;
  });
  const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement('canvas');

  canvas.width = Math.round(img.naturalWidth * scale);
  canvas.height = Math.round(img.naturalHeight * scale);

  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#1b1b1b';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  return canvas.toDataURL('image/jpeg', quality);
}
