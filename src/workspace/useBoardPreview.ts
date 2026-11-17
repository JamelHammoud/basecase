import { useEffect, useState } from 'react';
import type { ScenePart } from '../types/robotics';
import type { ElectronicsBoard } from '../wiring/boardTypes';
import { electricalClient } from '../wiring/electricalClient';

export function useBoardPreview(parts: ScenePart[], board: ElectronicsBoard | undefined) {
  const host = parts.find((part) => part.id === board?.partId);
  const [preview, setPreview] = useState<{
    host: ScenePart;
    board: ElectronicsBoard;
    mesh: ScenePart['mesh'];
    components: ScenePart[];
  } | null>(null);

  useEffect(() => {
    if (!host || !board) return;

    const client = electricalClient();
    let current = true;

    void client
      .call('preview', { part: host, board })
      .then((result) => {
        if (!current) return;

        const mesh: ScenePart['mesh'] = {
          positions: Array.from(result.positions),
          indices: Array.from(result.indices),
          baseSize: result.baseSize,
        };

        setPreview({ host, board, mesh, components: result.components });
      })
      .catch(() => {
        if (current) setPreview(null);
      })
      .finally(() => client.dispose());

    return () => {
      current = false;
      client.dispose();
    };
  }, [host, board]);

  const current = preview && host && preview.host === host && preview.board === board;
  const rendered = current ? { ...host, kind: 'mesh' as const, mesh: preview.mesh } : host;

  return [
    ...parts.map((part) => (part === host && rendered ? rendered : part)),
    ...(current ? preview.components : []),
  ];
}
