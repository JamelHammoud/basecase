import React from 'react';
import { Kbd } from '../design-system';
import { SettingsGroup } from './SettingsRows';

type Row = [string, string[]];

const GROUPS: Array<{ title: string; rows: Row[] }> = [
  {
    title: 'Navigate',
    rows: [
      ['Pan', ['Space', 'drag']],
      ['Zoom to selection', ['Z']],
      ['Isometric view', ['1']],
      ['Top view', ['2']],
      ['Front view', ['3']],
      ['Side view', ['4']],
    ],
  },
  {
    title: 'Tools',
    rows: [
      ['Move', ['V']],
      ['Rotate', ['E']],
      ['Scale', ['R']],
      ['Sculpt', ['C']],
      ['Pose', ['P']],
      ['Comment', ['M']],
      ['Measure', ['D']],
      ['Measure without snapping', ['⇧', 'click']],
      ['Measure vertically', ['⌥', 'click']],
      ['Annotate', ['N']],
      ['Marker while annotating', ['P']],
      ['Eraser while annotating', ['E']],
      ['Shapes', ['A']],
      ['Drop to floor', ['F']],
      ['Stack on part below', ['S']],
      ['Move or rotate without snapping', ['⇧', 'drag']],
    ],
  },
  {
    title: 'Edit',
    rows: [
      ['Undo', ['⌘Z']],
      ['Redo', ['⇧⌘Z']],
      ['Add to selection', ['⇧', 'click']],
      ['Box select', ['⇧', 'drag']],
      ['Select all', ['⌘A']],
      ['Copy', ['⌘C']],
      ['Cut', ['⌘X']],
      ['Paste', ['⌘V']],
      ['Group', ['⌘G']],
      ['Ungroup', ['⇧⌘G']],
      ['Duplicate', ['⌘D']],
      ['Delete', ['⌫']],
      ['Deselect', ['Esc']],
    ],
  },
  {
    title: 'Scenes',
    rows: [
      ['New scene', ['⌘T']],
      ['Show scenes', ['⌘O']],
      ['Close scene', ['⌘W']],
      ['Reopen closed scene', ['⇧⌘T']],
      ['Next scene', ['⌃Tab']],
      ['Previous scene', ['⌃⇧Tab']],
      ['Go to scene 1–8', ['⌘1–8']],
      ['Last scene', ['⌘9']],
    ],
  },
  {
    title: 'App',
    rows: [
      ['Command menu', ['⌘K']],
      ['Find parts', ['⌘F']],
      ['Show or hide sidebar', ['⌘B']],
      ['Show or hide inspector', ['⌘I']],
      ['Show or hide reference images', ['⇧I']],
      ['Show or hide camera views', ['⇧V']],
      ['Print', ['⌘P']],
      ['Run routine', ['⌘↩']],
      ['Settings', ['⌘,']],
      ['Shortcuts', ['?']],
    ],
  },
];

export const ShortcutsList: React.FC<{ sculptEnabled: boolean }> = ({ sculptEnabled }) => (
  <>
    {GROUPS.map((g) => ({ ...g, rows: g.rows.filter(([label]) => sculptEnabled || label !== 'Sculpt') })).map((g) => (
      <SettingsGroup key={g.title} title={g.title}>
        {g.rows.map(([label, keys]) => (
          <div
            key={label}
            className="flex items-center justify-between gap-[24px] h-[40px] px-[16px] text-[13.5px] text-white/90"
          >
            <span className="min-w-0 truncate">{label}</span>
            <span className="shrink-0 flex items-center gap-[4px]">
              {keys.map((k, i) =>
                /^[a-z]+$/.test(k) ? (
                  <span key={i} className="text-[12.5px] text-white/50">
                    {k}
                  </span>
                ) : (
                  <Kbd key={i}>{k}</Kbd>
                ),
              )}
            </span>
          </div>
        ))}
      </SettingsGroup>
    ))}
  </>
);
