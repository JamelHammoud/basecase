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
