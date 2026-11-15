export function datasetWrites() {
  const pending = new Map<string, Promise<unknown>>();

  return <T>(id: string, write: () => Promise<T>): Promise<T> => {
    const run = (pending.get(id) ?? Promise.resolve()).catch(() => {}).then(write);
    const clear = () => {
      if (pending.get(id) === run) pending.delete(id);
    };

    pending.set(id, run);
    run.then(clear, clear);

    return run;
  };
}
