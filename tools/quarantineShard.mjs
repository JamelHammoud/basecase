export function quarantineShard(entries, shard = '1/1') {
  const match = /^(\d+)\/(\d+)$/.exec(shard);
  const index = Number(match?.[1]);
  const count = Number(match?.[2]);

  if (!Number.isSafeInteger(count) || !Number.isSafeInteger(index) || index < 1 || index > count) {
    throw new Error('Quarantine shard must be an index/count pair with 1 <= index <= count.');
  }

  const files = [...new Set(entries.map((entry) => entry.file))].sort();
  const selected = new Set(files.filter((_file, position) => position % count === index - 1));

  return entries.filter((entry) => selected.has(entry.file));
}
