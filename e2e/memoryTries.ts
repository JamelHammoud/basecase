interface Saved {
  manifest: { id: string };
  recording?: string;
  film?: string;
}

type Arg = { arg?: unknown } | null;

export function memoryTries() {
  const tries = new Map<string, Saved>();

  const calls: Record<string, (arg: unknown) => unknown> = {
    'tries-list': () => [...tries.values()].map((t) => t.manifest),
    'tries-save': (arg) => {
      const saved = arg as Saved;
      const before = tries.get(saved.manifest.id);

      tries.set(saved.manifest.id, {
        manifest: saved.manifest,
        recording: saved.recording ?? before?.recording,
        film: saved.film ?? before?.film,
      });

      return { ok: true };
    },
    'tries-recording': (id) => tries.get(String(id))?.recording ?? null,
    'tries-film': (id) => tries.get(String(id))?.film ?? null,
    'tries-delete': (ids) => {
      (ids as string[]).forEach((id) => tries.delete(id));

      return { deleted: ids };
    },
  };

  return (name: string, body: Arg): { reply: unknown } | null => {
    const call = calls[name];

    return call ? { reply: call(body?.arg) } : null;
  };
}
