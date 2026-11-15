import { ALL_FORMATS, BlobSource, Input, UrlSource, VideoSampleSink } from 'mediabunny';
import { recordedVideoTime } from '../cameras/recordedFrames';
import { recordedVideoUrl } from '../cameras/recordedProtocol';
import { trainingJpeg } from '../cameras/trainingImage';
import type { StoredTry, TryVideo } from '../cases/tryFile';
import { readWebTryVideo } from '../cases/tryStore/webTryVideos';
import { lastAtOrBefore } from '../dataLayers/track';
import { recordingTopics } from '../topics/recordingTopics';
import { schemaKey } from '../topics/schemas';
import type { RecordedTopic } from '../topics/topicLog';
import { IS_WEB_DEMO } from '../utils/platform/webDemo';
import { decodeSourceImage, imageDimensions } from './import/imageDecode';
import type { TryFrameSource } from './tryFramesTypes';

export interface TryFrameImage {
  jpeg: Uint8Array;
  width: number;
  height: number;
}

export interface TryVideoDecoder {
  frame: (seconds: number) => Promise<TryFrameImage>;
  close: () => void;
}

export function compressedImageTopics(source: TryFrameSource): RecordedTopic[] {
  return (recordingTopics(source.recording)?.topics ?? []).filter(
    (topic) => schemaKey(topic.schema) === 'sensor_msgs/CompressedImage' && topic.blobs.has('data'),
  );
}

export async function topicFrame(topic: RecordedTopic, seconds: number): Promise<TryFrameImage> {
  const index = lastAtOrBefore(topic.t, seconds);
  const data = topic.blobs.get('data');

  if (index < 0 || !data || data.at[index] === data.at[index + 1])
    throw new Error('Choose a time with a recorded camera image.');

  const bytes = data.bytes.subarray(data.at[index], data.at[index + 1]);

  const image = await decodeSourceImage(bytes, new Map());

  return { ...image, jpeg: Uint8Array.from(image.jpeg) };
}

async function videoSource(stored: StoredTry, video: TryVideo) {
  if (!IS_WEB_DEMO) return new UrlSource(new URL(recordedVideoUrl(stored.id, video.camera), location.href).href);

  const blob = await readWebTryVideo(stored.id, video.camera);

  if (!blob) throw new Error('Import the camera video again.');

  return new BlobSource(blob);
}

export async function openTryVideo(stored: StoredTry, video: TryVideo): Promise<TryVideoDecoder> {
  const input = new Input({ formats: ALL_FORMATS, source: await videoSource(stored, video) });

  try {
    const track = await input.getPrimaryVideoTrack();

    if (!track || !(await track.canDecode())) throw new Error('Couldn’t decode the camera video.');

    const sink = new VideoSampleSink(track);

    return {
      frame: async (seconds) => {
        const time = recordedVideoTime(video, stored.source, seconds);

        if (time === null) throw new Error('Choose a time within the camera video.');

        const sample = await sink.getSample(time);

        if (!sample) throw new Error('Choose a time with a recorded camera image.');

        try {
          const [width, height] = imageDimensions(sample.displayWidth, sample.displayHeight);
          const canvas = new OffscreenCanvas(width, height);
          const context = canvas.getContext('2d');

          if (!context) throw new Error('Couldn’t read the camera image.');

          context.drawImage(sample.toCanvasImageSource(), 0, 0);

          return { jpeg: await trainingJpeg(canvas, 0), width: canvas.width, height: canvas.height };
        } finally {
          sample.close();
        }
      },
      close: () => input.dispose(),
    };
  } catch (error) {
    input.dispose();

    throw error;
  }
}
