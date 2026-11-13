export interface Settled<T> {
  key: string;
  tabId: string;
  comparison: T;
}

export interface ComparisonView<T> {
  result: Settled<T> | null;
  running: boolean;
}

export function newestComparison<T>() {
  let wanted: string | null = null;
  let view: ComparisonView<T> = { result: null, running: false };

  return {
    view: () => view,
    want(key: string): boolean {
      const start = view.result?.key !== key;

      wanted = key;
      view = { ...view, running: start };

      return start;
    },
    settle(result: Settled<T>): boolean {
      if (result.key !== wanted) return false;

      view = { result, running: false };

      return true;
    },
    fail(key: string): boolean {
      if (key !== wanted) return false;

      view = { ...view, running: false };

      return true;
    },
  };
}
