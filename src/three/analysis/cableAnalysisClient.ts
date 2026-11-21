import type { Netlist, WiringScene } from '../../wiring/connectors';
import type { AnalyzePayload } from './analysisOps';
import { copyGeometries, type SceneShapes } from './sceneShapes';

interface Pending {
  id: number;
  reject: (reason: unknown) => void;
  resolve: (result: Netlist) => void;
}

export function cableAnalysisClient(
  spawn = () => new Worker(new URL('./analysis.worker.ts', import.meta.url), { type: 'module' }),
) {
  let worker: Worker | null = null;
  let pending: Pending | null = null;
  let turn = 0;
  const shapes = new Set<string>();
  const geometries = new Set<string>();
  const stop = (reason: unknown) => {
    turn++;
    pending?.reject(reason);
    pending = null;
    worker?.terminate();
    worker = null;
    shapes.clear();
    geometries.clear();
  };
  const ensure = () => {
    if (worker) return worker;

    worker = spawn();
    worker.onmessage = ({ data }: MessageEvent<{ id: number; result: Netlist; error?: string }>) => {
      if (data.id !== pending?.id) return;

      const done = pending;

      pending = null;

      if (data.error) done.reject(new Error(data.error));
      else done.resolve(data.result);
    };
    worker.onerror = (event) => stop(new Error(event.message));

    return worker;
  };
  const prepare = async (snapshot: SceneShapes, scene: WiringScene): Promise<AnalyzePayload> => {
    const fresh = [...snapshot.shapes.values()].filter((shape) => !shapes.has(shape.key));
    const ids = [...snapshot.geometries.keys()].filter((id) => !geometries.has(id));
    const copied = await copyGeometries(snapshot, ids);

    return { shapes: fresh, geometries: copied, task: { kind: 'wiring', instances: snapshot.instances, scene } };
  };
  const run = async (snapshot: SceneShapes, scene: WiringScene, signal: AbortSignal): Promise<Netlist> => {
    signal.throwIfAborted();

    if (pending || shapes.size > snapshot.shapes.size + 64) stop(new DOMException('Aborted', 'AbortError'));

    const id = ++turn;
    const abort = () => {
      if (id === turn) stop(signal.reason);
    };

    signal.addEventListener('abort', abort, { once: true });

    try {
      const payload = await prepare(snapshot, scene);

      signal.throwIfAborted();

      if (id !== turn) throw new DOMException('Aborted', 'AbortError');

      const target = ensure();

      payload.shapes.forEach((shape) => shapes.add(shape.key));
      payload.geometries.forEach((geometry) => geometries.add(geometry.id));

      return await new Promise<Netlist>((resolve, reject) => {
        pending = { id, resolve, reject };
        target.postMessage(
          { id, op: 'analyze', payload },
          payload.geometries.flatMap((geometry) => [
            geometry.positions.buffer,
            ...(geometry.index ? [geometry.index.buffer] : []),
          ]),
        );
      });
    } catch (error) {
      if (id === turn) stop(error);

      throw error;
    } finally {
      signal.removeEventListener('abort', abort);
    }
  };

  return { run, dispose: () => stop(new DOMException('Aborted', 'AbortError')) };
}
