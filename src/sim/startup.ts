export function createStartupGate() {
  let generation = 0;
  const listeners = new Set<() => void>();

  return {
    begin: () => ++generation,
    current: (token: number) => token === generation,
    cancel: () => {
      generation++;
      listeners.forEach((listen) => listen());
    },
    subscribeStop: (listen: () => void) => {
      listeners.add(listen);

      return () => {
        listeners.delete(listen);
      };
    },
  };
}

export async function prepareStartup<T>(input: {
  build: () => Promise<T>;
  prepared: (model: T) => void;
  load: (model: T) => Promise<boolean>;
  current: () => boolean;
}): Promise<boolean> {
  const model = await input.build();

  if (!input.current()) return false;

  input.prepared(model);

  return (await input.load(model)) && input.current();
}
