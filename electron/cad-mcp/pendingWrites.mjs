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
  const waiting = [...new Set(ids.map((id) => pending.get(id)).filter(Boolean))];

  await Promise.allSettled(waiting);
}
