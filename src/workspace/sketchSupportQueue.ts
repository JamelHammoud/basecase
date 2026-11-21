export function sketchSupportQueue<T>(run: (input: T) => Promise<void>) {
  let running = false;
  let pending: { input: T } | null = null;
  let disposed = false;

  const drain = async () => {
    if (running || disposed) return;

    running = true;

    while (pending && !disposed) {
      const { input } = pending;

      pending = null;
      await run(input);
    }

    running = false;
  };

  return {
    submit: (input: T) => {
      if (disposed) return;

      pending = { input };
      void drain();
    },
    dispose: () => {
      disposed = true;
      pending = null;
    },
  };
}
