const pending = new Map();

export function trackWrite(ids, promise) {
  for (const id of ids) pending.set(id, promise);

  promise
    .finally(() => {
      for (const id of ids) if (pending.get(id) === promise) pending.delete(id);
    })
    .catch(() => {});

  return promise;
}

export async function settledWrites(ids) {
  const promises = ids ? ids.map((id) => pending.get(id)) : [...pending.values()];
  const waiting = [...new Set(promises.filter(Boolean))];

  await Promise.allSettled(waiting);
}
