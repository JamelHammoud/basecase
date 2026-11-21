import type { Page } from 'playwright-core';

interface Trace {
  start: number;
  frames: number[];
  longTasks: number[];
  peakHeap: number;
  previous: number;
  observing: boolean;
  observer: PerformanceObserver;
  pointer: () => void;
  inputToTwoFramesMs: number[];
}

interface Host extends Window {
  compositionTrace: Trace;
}

export async function startCompositionTrace(page: Page) {
  await page.evaluate(() => {
    const host = window as unknown as Host;
    const memory = () =>
      (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? 0;
    const observer = new PerformanceObserver((list) => {
      host.compositionTrace.longTasks.push(...list.getEntries().map((entry) => entry.duration));
    });
    const pointer = () => {
      const start = performance.now();

      requestAnimationFrame(() =>
        requestAnimationFrame(() => host.compositionTrace.inputToTwoFramesMs.push(performance.now() - start)),
      );
    };

    observer.observe({ type: 'longtask' });
    document.addEventListener('pointerdown', pointer, true);
    host.compositionTrace = {
      start: performance.now(),
      frames: [],
      longTasks: [],
      peakHeap: memory(),
      previous: performance.now(),
      observing: true,
      observer,
      pointer,
      inputToTwoFramesMs: [],
    };

    const sample = (now: number) => {
      const trace = host.compositionTrace;

      if (!trace.observing) return;

      trace.frames.push(now - trace.previous);
      trace.peakHeap = Math.max(trace.peakHeap, memory());
      trace.previous = now;
      requestAnimationFrame(sample);
    };

    requestAnimationFrame(sample);
  });
}

export async function stopCompositionTrace(page: Page) {
  return page.evaluate(() => {
    const trace = (window as unknown as Host).compositionTrace;

    trace.observing = false;
    trace.observer.disconnect();
    document.removeEventListener('pointerdown', trace.pointer, true);

    return {
      elapsedMs: performance.now() - trace.start,
      maximumFrameGapMs: Math.max(0, ...trace.frames),
      maximumLongTaskMs: Math.max(0, ...trace.longTasks),
      observedPeakMainHeapBytes: trace.peakHeap,
      longTasks: trace.longTasks,
      inputToTwoFramesMs: trace.inputToTwoFramesMs,
      export: performance
        .getEntriesByName('composition:export')
        .map((entry) => ({ duration: entry.duration, detail: (entry as PerformanceMeasure).detail })),
    };
  });
}
