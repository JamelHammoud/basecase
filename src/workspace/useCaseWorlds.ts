import { useEffect, useRef } from 'react';
import { piecesOf } from '../cases/worldPieces';
import type { Case } from '../cases/schema';
import { loadWorld, loadWorlds } from './worldStore';

export function useCaseWorlds(cases: Case[]) {
  const stagedId = useRef<string | null>(null);
  const hashes = cases.flatMap((c) => (c.world.mesh ? [c.world.mesh.hash] : [])).join(' ');

  useEffect(() => {
    if (hashes) void loadWorlds(hashes.split(' '));
  }, [hashes]);

  return (kase: Case | null, restage: (kase: Case) => void) => {
    const hash = kase?.world.mesh?.hash;

    stagedId.current = kase?.id ?? null;

    if (!kase || !hash || piecesOf(hash)) return;

    void loadWorld(hash).then((found) => {
      if (found && stagedId.current === kase.id) restage(kase);
    });
  };
}
