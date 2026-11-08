export function newestRuns() {
  let newest = 0;

  return {
    begin: () => {
      newest += 1;

      const id = newest;

      return { isNewest: () => id === newest };
    },
  };
}
