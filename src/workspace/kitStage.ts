import { errorMessage } from '../utils/errorMessage';

export function kitStages(guard: () => void) {
  return async <T>(stage: string, prepare: () => Promise<T>): Promise<T> => {
    guard();

    const start = performance.now();
    const outcome = { error: null as string | null };

    try {
      const result = await prepare();

      guard();

      return result;
    } catch (error) {
      outcome.error = errorMessage(error);

      try {
        guard();
      } catch (guardError) {
        outcome.error = errorMessage(guardError);

        throw guardError;
      }

      throw new Error(`${stage}: ${errorMessage(error)}`, { cause: error });
    } finally {
      const name = `kit:${stage}`;

      performance.clearMeasures(name);
      performance.measure(name, { start, end: performance.now(), detail: outcome });
    }
  };
}
