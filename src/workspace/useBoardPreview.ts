import { useEffect, useEffectEvent, useState } from 'react';
import type { ScenePart } from '../types/robotics';
import type { ElectronicsBoard } from '../wiring/boardTypes';
import { electricalClient } from '../wiring/electricalClient';
import { electricalSourceJson } from '../wiring/electricalSource';
import { boardPlacementDefinition } from '../wiring/boardRoutingRecord';

export function useBoardPreview(parts: ScenePart[], board: ElectronicsBoard | undefined) {
  const host = parts.find((part) => part.id === board?.partId);
  const definition = boardPlacementDefinition(board);
  const key = electricalSourceJson(definition);
  const latestDefinition = useEffectEvent(() => definition);
  const [preview, setPreview] = useState<{
    host: ScenePart;
    key: string;
    mesh: ScenePart['mesh'];
    components: ScenePart[];
  } | null>(null);

  useEffect(() => {
    const currentBoard = latestDefinition();

    if (!host || !currentBoard) return;

    const client = electricalClient();
    let current = true;

    void client
      .call('preview', { part: host, board: currentBoard })
      .then((result) => {
        if (!current) return;

        const mesh: ScenePart['mesh'] = {
          positions: Array.from(result.positions),
          indices: Array.from(result.indices),
          baseSize: result.baseSize,
        };

        setPreview({ host, key, mesh, components: result.components });
      })
      .catch(() => {
        if (current) setPreview(null);
      })
      .finally(() => client.dispose());

    return () => {
      current = false;
      client.dispose();
    };
  }, [host, key]);

  const current = preview && host && preview.host === host && preview.key === key;
  const rendered = current ? { ...host, kind: 'mesh' as const, mesh: preview.mesh } : host;

  return [
    ...parts.map((part) => (part === host && rendered ? rendered : part)),
    ...(current ? preview.components : []),
  ];
}
