import React from 'react';
import { Kbd } from '../design-system';
import { SettingsGroup } from './SettingsRows';

const GROUPS: Array<{ title: string; rows: Array<[string, string | string[]]> }> = [
  {
    title: 'Navigate',
    rows: [
      ['Orbit or pan', 'Two-finger scroll'],
      ['Zoom', 'Pinch'],
      ['Pan', ['Space', 'drag']],
      ['Pan while orbiting', ['⇧', 'scroll']],
      ['Zoom to selection', ['Z']],
      ['Isometric · Top · Front · Side', ['1', '2', '3', '4']],
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
      ['Group · Ungroup', ['⌘G', '⇧⌘G']],
      ['Duplicate', ['⌘D']],
      ['Delete', ['⌫']],
      ['Deselect', ['Esc']],
    ],
  },
  {
    title: 'Scenes',
    rows: [
      ['New scene', ['⌘T']],
      ['Close scene', ['⌘W']],
      ['Reopen closed scene', ['⇧⌘T']],
      ['Next · Previous scene', ['⌃Tab', '⌃⇧Tab']],
      ['Go to scene 1–8 · Last scene', ['⌘1', '⌘9']],
    ],
  },
  {
    title: 'App',
    rows: [
      ['Command menu', ['⌘K']],
      ['Find parts', ['⌘F']],
      ['Save scene', ['⌘S']],
      ['Show or hide sidebar', ['⌘B']],
      ['Show or hide inspector', ['⌘I']],
      ['Show or hide reference images', ['⇧I']],
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
              {typeof keys === 'string' ? (
                <span className="text-[12.5px] text-white/45">{keys}</span>
              ) : (
                keys.map((k, i) =>
                  /^[a-z]+$/.test(k) ? (
                    <span key={i} className="text-[12.5px] text-white/45">
                      {k}
                    </span>
                  ) : (
                    <Kbd key={i}>{k}</Kbd>
                  ),
                )
              )}
            </span>
          </div>
        ))}
      </SettingsGroup>
    ))}
  </>
);
