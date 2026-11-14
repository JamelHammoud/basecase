import { tryVideoUrl, useTries } from '../../cases/tryStore';
import type { TryRecord } from '../../cases/tries';

export function useTryVideo(record: TryRecord | null): string | null {
  const tries = useTries();
  const id = record?.manifest.source === 'operate' ? record.id : null;
  const listed = id ? tries?.find((t) => t.id === id) : undefined;

  return listed?.video ? tryVideoUrl(listed.id) : null;
}
