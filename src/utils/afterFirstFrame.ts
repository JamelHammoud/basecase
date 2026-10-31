export function afterFirstFrame(run: () => void): () => void {
  let frame = requestAnimationFrame(() => {
    frame = requestAnimationFrame(run);
  });

  return () => cancelAnimationFrame(frame);
}
