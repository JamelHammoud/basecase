import type { Solid } from '../wrap/manifold';

export function largestPiece<T extends Pick<Solid, 'volume'>>(pieces: readonly T[]) {
  let solid: T | undefined;
  let volumeMm3 = 0;

  for (const piece of pieces) {
    const volume = piece.volume();

    if (!solid || volume > volumeMm3) {
      solid = piece;
      volumeMm3 = volume;
    }
  }

  return solid ? { solid, volumeMm3 } : undefined;
}
