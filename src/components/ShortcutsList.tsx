import React from 'react';
import { paneKeys } from '../app/shortcuts';
import { Kbd } from '../design-system';
import { IS_WEB_DEMO } from '../utils/platform/webDemo';
import { SettingsGroup } from './SettingsRows';
import { SCULPT_ROWS, SHORTCUT_GROUPS, type ShortcutRow } from './shortcutGroups';

const isWord = (key: string) => /^[a-z-]+$/.test(key);

const rowKeys = ([, keys]: ShortcutRow) => (typeof keys === 'string' ? paneKeys(keys) : keys);

const shownGroups = (sculptEnabled: boolean) =>
  SHORTCUT_GROUPS.filter((g) => !(IS_WEB_DEMO && g.desktopOnly)).map((g) => ({
    ...g,
    rows: g.rows.filter(([l]) => sculptEnabled || !SCULPT_ROWS.has(l)),
  }));

export const ShortcutsList: React.FC<{ sculptEnabled: boolean }> = ({ sculptEnabled }) => (
  <>
    {shownGroups(sculptEnabled).map((g) => (
      <SettingsGroup key={g.title} title={g.title}>
        {g.rows.map((row) => (
          <div
            key={row[0]}
            className="flex items-center justify-between gap-[24px] h-[40px] px-[16px] text-[13.5px] text-white/90"
          >
            <span className="min-w-0 truncate">{row[0]}</span>
            <span className="shrink-0 flex items-center gap-[4px]">
              {rowKeys(row).map((k, i) =>
                isWord(k) ? (
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
