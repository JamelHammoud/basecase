import { useEffect, useState } from 'react';
import type { SettingsField, SettingsPane } from '../app/settingsPanes';
import { earthBridge, fetchEarthTile, forgetTileFailures, onTileFailure } from '../earth/earthBridge';
import { checkedOrigin, type EarthOrigin } from '../earth/earthOrigin';
import type { EarthView } from '../three/viewport/earthLayer';
import type { ProjectSettings } from '../types/robotics';
import { IS_WEB_DEMO } from '../utils/platform/webDemo';
import type { ShowToast } from './types';

interface EarthPlaceOptions {
  project: ProjectSettings;
  updateProjectNow: (patch: (p: ProjectSettings) => ProjectSettings) => void;
  openSettings: (pane?: SettingsPane, field?: SettingsField) => void;
  showToast: ShowToast;
}

export type EarthPlace = ReturnType<typeof useEarthPlace>;

const withShown = (earth: EarthOrigin, shown: boolean): EarthOrigin => ({ ...earth, hidden: shown ? undefined : true });

export function useEarthPlace({ project, updateProjectNow, openSettings, showToast }: EarthPlaceOptions) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const origin = checkedOrigin(project.earth);
  const view: EarthView | null = origin && !IS_WEB_DEMO ? { origin, fetchTile: fetchEarthTile } : null;

  const mapped = view !== null;

  useEffect(() => (mapped ? onTileFailure((message) => showToast(message)) : undefined), [mapped, showToast]);

  return {
    origin,
    view,
    sheetOpen,
    open: async () => {
      const { saved } = await earthBridge.account().catch(() => ({ saved: false }));

      if (saved) setSheetOpen(true);
      else openSettings('accounts', 'map-tiles');
    },
    close: () => setSheetOpen(false),
    place: (placed: EarthOrigin) => {
      forgetTileFailures();
      updateProjectNow((p) => ({ ...p, earth: placed }));
      setSheetOpen(false);
    },
    toggleShown: () => updateProjectNow((p) => (p.earth ? { ...p, earth: withShown(p.earth, !!p.earth.hidden) } : p)),
  };
}
