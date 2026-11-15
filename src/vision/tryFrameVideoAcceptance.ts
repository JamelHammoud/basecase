import { BufferTarget, CanvasSource, getFirstEncodableVideoCodec, Mp4OutputFormat, Output } from 'mediabunny';
import type { StoredTry } from '../cases/tryFile';
import { openTryVideo, type TryFrameImage } from './tryFrameMedia';

async function fixtureVideo(rotation: 0 | 90 = 0): Promise<Uint8Array> {
  const codec = await getFirstEncodableVideoCodec(['vp9'], { width: 64, height: 48 });

  if (!codec) throw new Error('The browser has no video encoder for the frame extraction fixture.');

  const canvas = new OffscreenCanvas(64, 48);
  const context = canvas.getContext('2d');

  if (!context) throw new Error('The fixture canvas could not open.');

  const target = new BufferTarget();
  const output = new Output({ format: new Mp4OutputFormat({ fastStart: 'in-memory' }), target });
  const source = new CanvasSource(canvas, { codec, bitrate: 100000 });
  const levels = [0, 32, 96, 160, 224, 255];

  output.addVideoTrack(source, { frameRate: 2, rotation });
  await output.start();

  for (const [index, value] of levels.entries()) {
    context.fillStyle = `rgb(${value}, ${value}, ${value})`;
    context.fillRect(0, 0, 64, 48);

    if (rotation) {
      context.fillStyle = `rgb(${255 - value}, ${255 - value}, ${255 - value})`;
      context.fillRect(32, 0, 32, 48);
    }

    await source.add(index / 2, 0.5, { keyFrame: true });
  }

  await output.finalize();

  if (!target.buffer) throw new Error('The fixture video could not be encoded.');

  return new Uint8Array(target.buffer);
}

function storedVideo(source: 'import' | 'operate'): StoredTry {
  return {
    version: 1,
    id: `${source}-video`,
    sceneId: 'video-scene',
    robot: { name: 'Recorded robot', modelHash: 'video-only', joints: [] },
    case: null,
    source,
    input: null,
    startedAt: '2026-11-15T00:00:00Z',
    seconds: 3,
    rate: 2,
    frames: 6,
    outcome: { verdict: 'unjudged', margin: null },
    seed: 0,
    sourceTry: null,
    faults: [],
    videos: [{ camera: 'front', path: 'front.mp4', from: 0.5, to: 2.5 }],
  };
}

async function measuredFrame(frame: TryFrameImage) {
  const bitmap = await createImageBitmap(new Blob([Uint8Array.from(frame.jpeg)], { type: 'image/jpeg' }));

  try {
    const context = new OffscreenCanvas(frame.width, frame.height).getContext('2d');

    if (!context) throw new Error('The extracted JPEG could not be read.');

    context.drawImage(bitmap, 0, 0);

    const pixel = context.getImageData(32, 24, 1, 1).data;
    const top = context.getImageData(frame.width / 2, frame.height / 4, 1, 1).data[0];
    const bottom = context.getImageData(frame.width / 2, (frame.height * 3) / 4, 1, 1).data[0];

    return {
      mean: (pixel[0] + pixel[1] + pixel[2]) / 3,
      width: frame.width,
      height: frame.height,
      jpegBytes: frame.jpeg.length,
      ends: [top, bottom],
    };
  } finally {
    bitmap.close();
  }
}

async function rotatedFrame(): Promise<TryFrameImage> {
  const stored = { ...storedVideo('import'), id: 'rotated-video' };
  const video = { camera: 'front', path: 'front.mp4', from: 0, to: 3 };
  const decoder = await openTryVideo(stored, video);

  try {
    return await decoder.frame(0);
  } finally {
    decoder.close();
  }
}

async function decodedSource(source: 'import' | 'operate'): Promise<TryFrameImage[]> {
  const stored = storedVideo(source);
  const decoder = await openTryVideo(stored, stored.videos![0]);
  const frames: TryFrameImage[] = [];

  try {
    for (const seconds of [0.5, 1, 1.5]) frames.push(await decoder.frame(seconds));

    return frames;
  } finally {
    decoder.close();
  }
}

export async function tryFrameVideoAcceptance() {
  const video = await fixtureVideo();
  const rotated = await fixtureVideo(90);
  const requests: string[] = [];
  const originalFetch = globalThis.fetch;
  const endpoint = new URL('/api/tries/video/', location.href).href;

  globalThis.fetch = async (input, init) => {
    const url = input instanceof Request ? input.url : String(input);

    if (!url.startsWith(endpoint)) return originalFetch(input, init);

    requests.push(url);

    const bytes = url.includes('/rotated-video/') ? rotated : video;

    return new Response(Uint8Array.from(bytes), {
      headers: { 'content-type': 'video/mp4', 'content-length': String(bytes.length) },
    });
  };

  try {
    const frames: TryFrameImage[] = [];

    for (const source of ['import', 'operate'] as const) frames.push(...(await decodedSource(source)));

    return {
      frames: await Promise.all(frames.map(measuredFrame)),
      rotated: await measuredFrame(await rotatedFrame()),
      requests,
    };
  } finally {
    globalThis.fetch = originalFetch;
  }
}
