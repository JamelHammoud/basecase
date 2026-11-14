import React, { useEffect, useRef, useState } from 'react';
import type { TrySource, TryVideo } from '../../cases/tryFile';
import type { RecordedVideoReply, RecordedVideoRequest } from '../../cameras/recorded/protocol';
import { useCameraVision } from '../../vision/useCameraVision';
import { clearVisionResults } from '../../vision/resultStore';
import { connectVisionSource } from '../../vision/client';
import { VisionOverlay } from './VisionOverlay';
import { tileFrame, tileLabel } from './tileStyle';

interface RecordedCameraTileProps {
  id: string;
  video: TryVideo;
  time: number;
  source: TrySource;
}

export const RecordedCameraTile: React.FC<RecordedCameraTileProps> = ({ id, video, time, source }) => {
  const canvas = useRef<HTMLDivElement>(null);
  const worker = useRef<Worker | null>(null);
  const [after, setAfter] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useCameraVision(video.camera);

  useEffect(() => {
    const host = canvas.current;

    if (!host) return;

    const target = document.createElement('canvas');

    target.className = 'absolute inset-0 w-full h-full block';
    host.append(target);

    const decoder = new Worker(new URL('../../cameras/recorded/decode.worker.ts', import.meta.url), { type: 'module' });
    const send = (message: RecordedVideoRequest, transfer: Transferable[] = []) =>
      decoder.postMessage(message, transfer);

    worker.current = decoder;
    decoder.onmessage = ({ data }: MessageEvent<RecordedVideoReply>) => {
      if (data.type === 'error') setError(data.message);
      else setAfter(data.timestamp);
    };
    decoder.onerror = () => setError('Couldn’t open the recorded video.');

    const surface = target.transferControlToOffscreen();

    send({ type: 'open', id, video, source, canvas: surface }, [surface]);

    clearVisionResults(video.camera);

    const disconnect = connectVisionSource((port, cameras) => send({ type: 'vision', port, cameras }, [port]), {
      exclusive: [video.camera],
    });

    return () => {
      disconnect();
      clearVisionResults(video.camera);
      decoder.terminate();
      worker.current = null;
      target.remove();
    };
  }, [id, video, source]);

  useEffect(() => {
    worker.current?.postMessage({ type: 'seek', time } satisfies RecordedVideoRequest);
  }, [time]);

  return (
    <div data-testid="recorded-camera-tile" data-camera={video.camera} className={tileFrame(true, false)}>
      <div ref={canvas} className="absolute inset-0" />
      <VisionOverlay camera={video.camera} after={after} mediaSource={id} />
      <span className={tileLabel}>{video.camera}</span>
      {error && (
        <span className="absolute inset-0 flex items-center justify-center px-3 text-[13px] text-red-400">{error}</span>
      )}
    </div>
  );
};
