import { useEffect, useState } from 'react';
import { synthesizeInWorker } from '../../linkage/linkageClient';
import { MIN_PATH_POINTS, type LinkageSolution, type Vec2 } from '../../utils/linkage';

const SETTLE_MS = 250;

interface Solved {
  path: Vec2[];
  solutions: LinkageSolution[];
}

export function useLinkageSolutions(path: Vec2[]) {
  const [solved, setSolved] = useState<Solved | null>(null);

  useEffect(() => {
    if (path.length < MIN_PATH_POINTS) return;

    let live = true;
    const timer = setTimeout(() => {
      synthesizeInWorker(path)
        .catch(() => [])
        .then((solutions) => live && setSolved({ path, solutions }));
    }, SETTLE_MS);

    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [path]);

  const current = solved?.path === path ? solved : null;

  return { solutions: current?.solutions ?? [], unsolvable: !!current && current.solutions.length === 0 };
}
