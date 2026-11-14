import { useEffect, useState } from 'react';
import { DataLayerStore } from '../dataLayers/store';
import { liveScanPoints, liveScanTrack, recordedScanTrack, scanSources } from '../dataLayers/simTracks';
import type { SimModel } from '../sim/mjcfTypes';
import type { Viewport3DHandle } from '../components/Viewport3D';
import type { Simulation } from '../sim/useSimulation';
import type { ScenePart } from '../types/robotics';
import type { TryTimeline } from './useTryTimeline';

interface DataLayerOptions {
  sim: Simulation;
  timeline: TryTimeline;
  parts: ScenePart[];
  viewportRef: React.RefObject<Viewport3DHandle | null>;
}

const isSimLayer = (id: string) => id.startsWith('scan:');

function useViewportDraw(store: DataLayerStore, viewportRef: DataLayerOptions['viewportRef']) {
  useEffect(() => {
    let queued = false;
    const draw = () => {
      queued = false;

      const drawn = viewportRef.current?.setDataLayers(store.input()) ?? [];

      store.noteDrawn(drawn);
    };
    const stop = store.subscribeDraw(() => {
      if (queued) return;

      queued = true;
      queueMicrotask(draw);
    });

    draw();

    return stop;
  }, [store, viewportRef]);
}

interface ScanScene {
  model: SimModel | null;
  parts: ScenePart[];
}

const sourcesOf = ({ model, parts }: ScanScene) => (model ? scanSources(model, parts) : []);

function useLiveScans(
  store: DataLayerStore,
  subscribePoses: Simulation['subscribePoses'],
  { model, parts }: ScanScene,
) {
  useEffect(() => {
    const sources = sourcesOf({ model, parts });
    let version = 0;

    return subscribePoses((_, frame) => {
      if (!frame.scan || store.playhead() !== null) return;

      version++;

      for (const { source, points } of liveScanPoints(sources, frame.scan.points, frame.scan.counts)) {
        store.setTrack(liveScanTrack(source, points, version));
      }
    });
  }, [store, subscribePoses, model, parts]);
}

function useRecordedScans(store: DataLayerStore, timeline: TryTimeline, { model, parts }: ScanScene) {
  const { recording } = timeline;
  const replaying = timeline.open && !!recording;

  useEffect(() => {
    if (!replaying || !recording) return;

    for (const source of sourcesOf({ model, parts })) {
      const track = recordedScanTrack(recording, source);

      if (track) store.setTrack(track);
    }

    return () => store.removeTracks((t) => isSimLayer(t.id));
  }, [store, replaying, recording, model, parts]);

  const at = replaying ? (recording.t[timeline.frame] ?? timeline.frame * timeline.dt) : null;

  useEffect(() => store.setPlayhead(at), [store, at]);
}

export function useDataLayers({ sim, timeline, parts, viewportRef }: DataLayerOptions): DataLayerStore {
  const [store] = useState(() => new DataLayerStore());
  const scene = { model: sim.model, parts };
  const loaded = sim.status !== 'off' && !!sim.model;

  useViewportDraw(store, viewportRef);
  useLiveScans(store, sim.subscribePoses, scene);
  useRecordedScans(store, timeline, scene);

  useEffect(() => {
    if (loaded) return;

    store.removeTracks((t) => isSimLayer(t.id));
  }, [store, loaded]);

  return store;
}
