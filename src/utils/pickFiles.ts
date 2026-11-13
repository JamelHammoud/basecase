let nextPick: File[] | null = null;

export const pickNextFiles = (files: File[]) => {
  nextPick = files;
};

export function pickFiles(accept: string, multiple = false): Promise<File[]> {
  const queued = nextPick;

  nextPick = null;

  if (queued) return Promise.resolve(queued);

  return new Promise((resolve) => {
    const input = document.createElement('input');

    input.type = 'file';
    input.accept = accept;
    input.multiple = multiple;
    input.addEventListener('change', () => resolve(Array.from(input.files ?? [])), { once: true });
    input.addEventListener('cancel', () => resolve([]), { once: true });
    input.click();
  });
}
