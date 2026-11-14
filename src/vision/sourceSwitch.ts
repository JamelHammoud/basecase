type Stop = () => void;

interface SourceSwitch {
  subscribe: (change: () => void) => Stop;
  start: () => Promise<Stop>;
  error: (error: unknown) => void;
}

export async function switchVisionSource(options: SourceSwitch): Promise<Stop> {
  let generation = 0;
  let closed = false;
  let release: Stop | undefined;

  const change = async () => {
    const ticket = ++generation;

    release?.();
    release = undefined;

    const stop = await options.start();

    if (closed || generation !== ticket) return stop();

    release = stop;
  };
  const unsubscribe = options.subscribe(() => void change().catch(options.error));

  try {
    await change();
  } catch (error) {
    closed = true;
    generation++;
    release?.();
    unsubscribe();

    throw error;
  }

  return () => {
    if (closed) return;

    closed = true;
    generation++;
    unsubscribe();
    release?.();
  };
}
