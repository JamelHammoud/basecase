export function workerIndices(count, workers) {
  return Array.from({ length: workers }, (_, worker) => {
    const indices = [];

    for (let i = worker; i < count; i += workers) indices.push(i);

    return indices;
  });
}
