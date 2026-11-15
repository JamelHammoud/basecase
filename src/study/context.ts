import type { Case } from '../cases/schema';

type NamedCase = Pick<Case, 'id' | 'name'>;

export function studyCaseLabel(saved: NamedCase | undefined, active: NamedCase | null): string | undefined {
  return saved && (saved.id !== active?.id || saved.name !== active?.name) ? saved.name : undefined;
}
