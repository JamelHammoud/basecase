import { useEffect } from 'react';
import type { PreparedWorld } from '../cases/worldImportOps';
import { registerWorldAsset } from '../cases/worldAssets';
import type { DataLayerStore } from '../dataLayers/store';
import { errorMessage } from '../utils/errorMessage';
import { mapWorldAction } from './mapWorldAction';
import type { TryTimeline } from './useTryTimeline';
import type { CaseBuilder } from './useCaseBuilder';

interface MapWorldOptions {
  timeline: TryTimeline;
  matching: boolean;
  builder: CaseBuilder;
  showCases: () => void;
  failed: (message: string) => void;
}

export function useMapWorld(store: DataLayerStore, options: MapWorldOptions) {
  const { timeline, matching, builder, showCases, failed } = options;
  const topics = timeline.open ? timeline.recording?.topics : undefined;
  const id = timeline.record?.id;
  const name = 'Map';
  const startInWorld = builder.startInWorld;

  useEffect(() => {
    if (!topics || !id) {
      store.setWorldMaker(undefined);

      return;
    }

    const ready = (prepared: PreparedWorld) => {
      if (prepared.kind !== 'mesh') return;

      const asset = { world: prepared.world, pieces: prepared.pieces };

      registerWorldAsset(prepared.hash, asset, prepared.serializedJson);
      showCases();
      startInWorld(prepared.hash, asset);
    };

    store.setWorldMaker(
      mapWorldAction(
        { topics, sourceTry: id, name, matching },
        { ready, failed: (error) => failed(errorMessage(error)) },
      ),
    );

    return () => store.setWorldMaker(undefined);
  }, [store, topics, id, name, matching, showCases, failed, startInWorld]);
}
