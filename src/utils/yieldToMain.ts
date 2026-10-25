const SLICE_MS = 8;

type Scheduler = { yield?: () => Promise<void> };

export const yieldToMain = (): Promise<void> => {
  const scheduler = (globalThis as { scheduler?: Scheduler }).scheduler;

  return scheduler?.yield ? scheduler.yield() : new Promise((resolve) => setTimeout(resolve, 0));
};

export function timeSlicer(): () => Promise<void> {
  let sliceStart = performance.now();

  return async () => {
    if (performance.now() - sliceStart < SLICE_MS) return;

    await yieldToMain();
    sliceStart = performance.now();
  };
}
