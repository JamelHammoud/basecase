interface LabelTask<T> {
  task: () => Promise<T>;
  apply: (result: T) => void;
  busy: (value: boolean) => void;
  error: (cause: unknown) => void;
}

export function createLabelTasks() {
  let opened = true;
  let pending = false;
  let generation = 0;
  const current = (token: number) => opened && generation === token;

  return {
    open: () => {
      opened = true;
      pending = false;
      generation++;
    },
    close: () => {
      opened = false;
      pending = false;
      generation++;
    },
    async run<T>({ task, apply, busy, error }: LabelTask<T>) {
      if (!opened || pending) return;

      const token = generation;

      pending = true;
      busy(true);

      try {
        const result = await task();

        if (current(token)) apply(result);
      } catch (cause) {
        if (current(token)) error(cause);
      } finally {
        if (current(token)) {
          pending = false;
          busy(false);
        }
      }
    },
  };
}
