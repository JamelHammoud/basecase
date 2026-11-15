export async function eachLimited(list, limit, run) {
  let next = 0;

  const worker = async () => {
    while (next < list.length) {
      const index = next++;

      await run(list[index], index);
    }
  };

  await Promise.all(Array.from({ length: Math.min(limit, list.length) }, worker));
}
