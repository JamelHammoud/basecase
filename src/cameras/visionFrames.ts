import type { VisionSource } from '../vision/types';

export interface VisionAssignment {
  source?: VisionSource;
  camera: string;
  modelId: string;
  fps: number;
  continuous?: boolean;
}

type Picture = ImageBitmap | VideoFrame;

type Pending = VisionAssignment & { frame: Picture; timestamp: number };

const frameKey = (camera: string, modelId: string) => `${camera}:${modelId}`;

function detach(port: MessagePort | null) {
  if (!port) return;

  port.onmessage = null;
  port.postMessage({ type: 'detach' });
  port.close();
}

export function visionFrameSender(capture: (camera: string) => Promise<Picture>) {
  let port: MessagePort | null = null;
  let assignments: VisionAssignment[] = [];
  let generation = 0;
  let clockOffset = 0;
  const last = new Map<string, number>();
  const capturing = new Set<string>();
  const inFlight = new Set<string>();
  const pending = new Map<string, Pending>();

  const clearFrames = () => {
    last.clear();
    inFlight.clear();
    pending.forEach((frame) => frame.frame.close());
    pending.clear();
  };

  const post = (frame: Pending) => {
    if (!port) return frame.frame.close();

    const id = frameKey(frame.camera, frame.modelId);

    inFlight.add(id);

    try {
      port.postMessage({ type: 'frame', ...frame }, [frame.frame]);
    } catch (error) {
      inFlight.delete(id);
      frame.frame.close();

      throw error;
    }
  };

  const ready = ({ data }: MessageEvent) => {
    if (data.type !== 'result' && data.type !== 'error' && data.type !== 'dropped') return;

    const { camera, modelId } = data.result ?? data;
    const id = frameKey(camera, modelId);
    const latest = pending.get(id);

    pending.delete(id);
    inFlight.delete(id);

    if (latest) post(latest);
  };

  const queue = (frame: Pending) => {
    const id = frameKey(frame.camera, frame.modelId);

    if (!inFlight.has(id)) return post(frame);

    pending.get(id)?.frame.close();
    pending.set(id, frame);
  };

  return {
    connect(next: MessagePort, mainOrigin = performance.timeOrigin) {
      detach(port);
      clearFrames();
      port = next;
      port.onmessage = ready;
      clockOffset = performance.timeOrigin - mainOrigin;
      generation++;
    },
    configure(next: VisionAssignment[]) {
      assignments = next;
      generation++;

      for (const [id, frame] of pending) {
        if (next.some((assignment) => frameKey(assignment.camera, assignment.modelId) === id)) continue;

        frame.frame.close();
        pending.delete(id);
      }
    },
    async send(camera: string, timestamp: number, captureOverride?: () => Promise<Picture>, pacedAt = timestamp) {
      if (!port || capturing.has(camera)) return;

      const requested = assignments.filter((a) => a.camera === camera);
      const target = port;
      const ticket = generation;
      const due = requested.filter((assignment) => {
        const id = frameKey(camera, assignment.modelId);
        const interval = 1000 / Math.min(30, Math.max(1, assignment.fps));

        if (pacedAt - (last.get(id) ?? -Infinity) < interval) return false;

        last.set(id, pacedAt);

        return true;
      });

      capturing.add(camera);

      try {
        await Promise.all(
          due.map(async (assignment) => {
            const frame = await (captureOverride?.() ?? capture(camera));

            if (generation !== ticket || port !== target) frame.close();
            else queue({ ...assignment, frame, timestamp: timestamp + clockOffset });
          }),
        );
      } finally {
        capturing.delete(camera);
      }
    },
    close() {
      detach(port);
      port = null;
      assignments = [];
      generation++;
      clearFrames();
    },
  };
}

export function visionBitmapCopier() {
  const canvases = new Map<string, OffscreenCanvas>();

  return (camera: string, source: OffscreenCanvas | ImageBitmap): ImageBitmap => {
    let canvas = canvases.get(camera);

    if (!canvas || canvas.width !== source.width || canvas.height !== source.height) {
      canvas = new OffscreenCanvas(source.width, source.height);
      canvases.set(camera, canvas);
    }

    const context = canvas.getContext('2d');

    if (!context) throw new Error('The camera frame could not be copied.');

    context.drawImage(source, 0, 0);

    return canvas.transferToImageBitmap();
  };
}
