const pending = new Map<string, Promise<unknown>>();

const ignored = () => undefined;

export const sceneWritten = (id: string): Promise<void> =>
  (pending.get(id) ?? Promise.resolve()).then(ignored, ignored);

export function queueSceneWrite<T>(id: string, write: () => Promise<T>): Promise<T> {
  const run = sceneWritten(id).then(write);
  const clear = () => {
    if (pending.get(id) === run) pending.delete(id);
  };

  pending.set(id, run);
  run.then(clear, clear);

  return run;
}
