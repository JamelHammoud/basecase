type RobotEvent = Record<string, unknown>;

export function networkRobotEvents(deliver: (event: RobotEvent) => Promise<unknown>) {
  const pending = new Set<Promise<void>>();
  const errors: unknown[] = [];
  let closing = false;

  return {
    emit(event: RobotEvent) {
      if (closing) return;

      const delivery = deliver(event)
        .then(
          () => {},
          (error: unknown) => {
            errors.push(error);
          },
        )
        .finally(() => pending.delete(delivery));

      pending.add(delivery);
    },
    async close() {
      closing = true;
      await Promise.all(pending);

      if (errors.length) throw new AggregateError(errors, 'Network robot event delivery failed');
    },
  };
}
