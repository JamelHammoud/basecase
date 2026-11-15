import { afterEach, describe, expect, it, vi } from 'vitest';
import { fixtureArm, importedStored } from '../datasets/labelFixtures';
import { sceneModel } from '../datasets/import/fixtures';
import type { StoredTry } from '../cases/tryFile';
import { TopicCollector } from '../topics/collector';
import { TopicIndex } from '../topics/topicIndex';
import { openTryVideo, topicFrame } from './tryFrameMedia';

const mocks = vi.hoisted(() => ({
  decode: vi.fn(async () => true),
  sample: vi.fn(),
  dispose: vi.fn(),
  draw: vi.fn(),
  close: vi.fn(),
  url: vi.fn(),
}));

vi.mock('mediabunny', () => ({
  ALL_FORMATS: [],
  BlobSource: class {},
  UrlSource: class {
    constructor(url: string) {
      mocks.url(url);
    }
  },
  Input: class {
    getPrimaryVideoTrack = async () => ({ canDecode: mocks.decode });
    dispose = mocks.dispose;
  },
  VideoSampleSink: class {
    getSample = mocks.sample;
  },
}));

const jpeg = new Uint8Array([255, 216, 255, 192, 0, 11, 8, 0, 4, 0, 4, 1, 1, 17, 0, 255, 217]);
const model = sceneModel([fixtureArm()]);
const video = { camera: 'front', path: 'videos/front.mp4', from: 5, to: 9 };

async function stored(source: StoredTry['source']) {
  return { ...(await importedStored(model, { frames: 3, dt: 0.1 } as Parameters<typeof importedStored>[1])), source };
}

function prepareCanvas() {
  vi.stubGlobal('location', { href: 'https://app.basecase.so/studio' });
  vi.stubGlobal(
    'OffscreenCanvas',
    class {
      readonly width: number;
      readonly height: number;

      constructor(width: number, height: number) {
        this.width = width;
        this.height = height;
      }
      getContext = () => ({ drawImage: mocks.draw });
      convertToBlob = async () => new Blob([jpeg], { type: 'image/jpeg' });
    },
  );
  mocks.sample.mockResolvedValue({
    displayWidth: 4,
    displayHeight: 4,
    toCanvasImageSource: () => ({}),
    close: mocks.close,
  });
}

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  mocks.decode.mockResolvedValue(true);
});

describe('recorded image extraction', () => {
  it.each([
    ['import', 2, 7],
    ['operate', 7, 2],
  ] as const)('decodes %s video at its stored clip offset', async (source, time, expected) => {
    prepareCanvas();

    const manifest = await stored(source);
    const decoder = await openTryVideo(manifest, video);

    expect(await decoder.frame(time)).toEqual({ jpeg, width: 4, height: 4 });
    expect(mocks.sample).toHaveBeenCalledWith(expected);
    expect(mocks.url).toHaveBeenCalledWith(`https://app.basecase.so/api/tries/video/${manifest.id}/front`);
    expect(mocks.close).toHaveBeenCalledOnce();
    decoder.close();
    expect(mocks.dispose).toHaveBeenCalledOnce();
  });

  it('refuses a clip time before decoding and closes an unsupported input', async () => {
    prepareCanvas();

    const manifest = await stored('operate');
    const decoder = await openTryVideo(manifest, video);

    await expect(decoder.frame(2)).rejects.toThrow('within the camera video');
    expect(mocks.sample).not.toHaveBeenCalled();
    decoder.close();
    mocks.decode.mockResolvedValue(false);
    await expect(openTryVideo(manifest, video)).rejects.toThrow('decode');
    expect(mocks.dispose).toHaveBeenCalledTimes(2);
  });

  it('transfers a topic JPEG without detaching retained images for later selections', async () => {
    const collector = new TopicCollector();

    collector.add('/camera/compressed', 'sensor_msgs/CompressedImage', 0n, { format: 'jpeg', data: jpeg });

    const topic = new TopicIndex(collector.finish(0n)).topics[0];
    const first = await topicFrame(topic, 0);

    structuredClone(first, { transfer: [first.jpeg.buffer] });
    expect((await topicFrame(topic, 0)).jpeg).toEqual(jpeg);
    await expect(topicFrame(topic, -1)).rejects.toThrow('recorded camera image');
  });
});
