import type { Recording } from './recorder';
import type { RecordedEfforts } from './recordedFrames';
import type { Case } from '../cases/schema';
import type { Controller } from './engine';
import type { SimRequest } from './simMessages';
import type { useSimWorker } from './useSimWorker';

type WorkerLink = ReturnType<typeof useSimWorker>;

export function simulationRecording(input: {
  worker: WorkerLink;
  send: (message: SimRequest) => void;
  setPlaying: (playing: boolean) => void;
  adopt: (controller: Controller) => void;
  setSpeed: (speed: number) => void;
}) {
  const { worker, send, setPlaying, adopt } = input;

  return {
    record: () => send({ type: 'record', on: true }),
    stopRecording: worker.stopRecording,
    play: () => {
      send({ type: 'play' });
      setPlaying(true);
    },
    pause: () => send({ type: 'pause' }),
    reset: () => send({ type: 'reset' }),
    setSpeed: (value: number) => {
      input.setSpeed(value);
      send({ type: 'speed', value });
    },
    scrub: (recording: Recording | null, efforts?: RecordedEfforts) => {
      setPlaying(false);

      return worker.scrub(recording, efforts);
    },
    seek: worker.seek,
    sought: worker.sought,
    checkpoints: worker.checkpoints,
    branch: async (frame: number, kase: Case, bytes?: Uint8Array) => {
      const result = await worker.branch(frame, kase, bytes);

      if (result) adopt(result.controller);

      return result;
    },
    cancelBranch: () => {
      worker.cancelRecording();
      void worker.scrub(null);
    },
  };
}
