import type { Command } from '../components/CommandPalette';
import { WebIcon, type ContextMenuEntry } from '../design-system';
import { IS_WEB_DEMO } from '../utils/platform/webDemo';
import type { EarthPlace } from './useEarthPlace';

const ic = 'w-4 h-4';
const KEYWORDS = 'earth gps google maps tiles location street outdoor globe coordinates';

export function earthCommands(earth: EarthPlace): Command[] {
  if (IS_WEB_DEMO) return [];

  const place: Command = {
    id: 'place-on-map',
    group: 'Scene',
    label: 'Place on Map',
    icon: <WebIcon className={ic} />,
    keywords: KEYWORDS,
    run: () => void earth.open(),
  };

  if (!earth.origin) return [place];

  return [
    place,
    {
      id: 'toggle-map',
      group: 'View',
      label: earth.origin.hidden ? 'Show Map' : 'Hide Map',
      icon: <WebIcon className={ic} />,
      keywords: KEYWORDS,
      run: earth.toggleShown,
    },
  ];
}

export function earthMenuItems(earth: EarthPlace): ContextMenuEntry[] {
  if (IS_WEB_DEMO) return [];

  return [{ label: 'Place on Map', icon: <WebIcon className={ic} />, onSelect: () => void earth.open() }];
}

export const mapShownItem = (earth: EarthPlace): ContextMenuEntry[] =>
  earth.origin && !IS_WEB_DEMO
    ? [{ label: 'Show Map', checked: !earth.origin.hidden, onSelect: earth.toggleShown }]
    : [];
