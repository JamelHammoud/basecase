import { useEffect, useSyncExternalStore } from 'react';
import { LiveMap, MAP_LAYER, mapTrack, tryMap } from '../dataLayers/mapClient';
import { sameHits } from '../dataLayers/liveScans';
import { scanSources } from '../dataLayers/simTracks';
import type { DataLayerStore } from '../dataLayers/store';
import type { SimModel } from '../sim/mjcfTypes';
import type { Simulation } from '../sim/useSimulation';
import type { ScenePart } from '../types/robotics';
import type { TryTimeline } from './useTryTimeline';

interface MapScene {
  model: SimModel | null;
  parts: ScenePart[];
}

const isMap = (id: string) => id === MAP_LAYER;

function useTryMap(store: DataLayerStore, timeline: TryTimeline, { model, parts }: MapScene) {
  const recording = timeline.open ? timeline.recording : null;
  const matching = useSyncExternalStore(store.subscribe, store.matching);

  useEffect(() => {
    if (!recording) return;

    let current = true;

    store.removeTracks((t) => isMap(t.id));
    void tryMap(recording, model ? scanSources(model, parts) : [], matching).then((cloud) => {
      if (current && cloud) store.setTrack(mapTrack(cloud));
    });

    return () => {
      current = false;
      store.removeTracks((t) => isMap(t.id));
    };
  }, [store, recording, model, parts, matching]);
}

function useLiveMap(store: DataLayerStore, sim: Simulation, replaying: boolean) {
  const { subscribePoses, model } = sim;
  const active = !replaying && sim.status !== 'off';

  useEffect(() => {
    if (!model || !active) return;

    let live = new LiveMap();
    let sent: Float32Array = new Float32Array();
    let version = 0;
    let time = -Infinity;

    const stop = subscribePoses((_, frame) => {
      const hits = frame.scan?.points;

      if (frame.stats.time < time) {
        live.end();
        live = new LiveMap();
        sent = new Float32Array();
        store.removeTracks((t) => isMap(t.id));
      }

      time = frame.stats.time;

      if (!hits?.length || store.playhead() !== null || sameHits(hits, sent)) return;

      sent = hits;

      const session = live;

      void session.add(hits).then((grew) => {
        if (grew && store.playhead() === null) store.setTrack(mapTrack(session.cloud(), ++version));
      });
    });

    return () => {
      stop();
      live.end();
      store.removeTracks((t) => isMap(t.id));
    };
  }, [store, subscribePoses, model, active]);
}

export function useMapLayer(store: DataLayerStore, sim: Simulation, timeline: TryTimeline, parts: ScenePart[]) {
  useTryMap(store, timeline, { model: sim.model, parts });
  useLiveMap(store, sim, timeline.open);
}
