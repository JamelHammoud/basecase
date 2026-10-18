import React, { useMemo, useState } from 'react';
import { ContextMenu, ContextMenuEntry, EmptyState, RobotsIcon, SearchField, SectionHeader, useScrollFade } from '../design-system';
import { ROBOT_CATEGORIES, ROBOT_PRESETS, rawUrl, type RobotPreset } from '../utils/robotImport';
import { ROBOT_DRAG_TYPE } from '../data/dnd';
import { forgetImportedRobot, presetPreviewUrl, useImportedRobots, type ImportedRobot } from '../utils/robotPreview';

/**
 * Robots: published robots to insert with their real joints, ready to pose. Search first, then
 * Imported (robots you inserted from a link) and one section per kind (Humanoids, Small bipeds,
 * Quadrupeds, Arms, Hands), as tiles with a preview of each robot. Import Robot… (a URDF or MJCF
 * link or folder) is the + in the view's header.
 */
export const RobotsPanel: React.FC<{
  onInsert: (preset: RobotPreset) => Promise<unknown> | void;
}> = ({ onInsert }) => {
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; entries: ContextMenuEntry[] } | null>(null);
  const { ref: fadeRef, style: fadeStyle } = useScrollFade();
  const remembered = useImportedRobots();
  const q = query.trim().toLowerCase();
  const presetUrls = useMemo(() => new Set(ROBOT_PRESETS.map((p) => rawUrl(p.url))), []);
  const imported = remembered.filter((r) => !presetUrls.has(rawUrl(r.url)) && (!q || [r.name, r.url].some((s) => s.toLowerCase().includes(q))));
  const shown = ROBOT_PRESETS.filter((r) => !q || [r.title, r.maker, r.category, r.description].some((s) => s.toLowerCase().includes(q)));
  // A preset's own import preview, if its shipped one is missing
  const fallback = (p: RobotPreset) => remembered.find((r) => rawUrl(r.url) === rawUrl(p.url))?.thumbnail;

  const insert = async (key: string, preset: RobotPreset) => {
    if (busy) return;
    setBusy(key);
    try {
      await onInsert(preset);
    } finally {
      setBusy(null);
    }
  };
  /** An imported robot inserts again from its link */
  const asPreset = (r: ImportedRobot): RobotPreset => ({
    id: r.url,
    title: r.name,
    maker: '',
    category: 'Humanoids',
    joints: r.joints,
    description: '',
    url: r.url,
  });

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="px-[12px] pb-[10px] shrink-0">
        <SearchField
          value={query}
          onChange={setQuery}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              if (query) setQuery('');
              else (e.target as HTMLInputElement).blur();
            }
            if (e.key === 'Enter') {
              if (imported.length) void insert(imported[0].url, asPreset(imported[0]));
              else if (shown.length) void insert(shown[0].id, shown[0]);
            }
          }}
          placeholder="Search robots"
          aria-label="Search robots"
        />
      </div>
      <div ref={fadeRef} className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden" style={fadeStyle}>
        {!shown.length && !imported.length ? (
          <EmptyState title={`No matches for “${query.trim()}”`} />
        ) : (
          <div className="px-[8px] pb-4">
            {imported.length > 0 && (
              <section className="mb-3">
                <SectionHeader title="Imported" />
                <TileGrid>
                  {imported.map((r) => (
                    <RobotTile
                      key={r.url}
                      name={r.name}
                      meta={sourceOf(r.url)}
                      images={[r.thumbnail]}
                      disabled={!!busy}
                      drag={{ url: r.url, name: r.name }}
                      onInsert={() => void insert(r.url, asPreset(r))}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        setMenu({
                          x: e.clientX,
                          y: e.clientY,
                          entries: [
                            { label: 'Insert', onSelect: () => void insert(r.url, asPreset(r)) },
                            { divider: true },
                            { label: 'Remove from Imported', tone: 'danger', onSelect: () => forgetImportedRobot(r.url) },
                          ],
                        });
                      }}
                    />
                  ))}
                </TileGrid>
              </section>
            )}
            {ROBOT_CATEGORIES.map((c) => {
              const list = shown.filter((r) => r.category === c);
              if (!list.length) return null;
              return (
                <section key={c} className="mb-3">
                  <SectionHeader title={c} />
                  <TileGrid>
                    {list.map((r) => (
                      <RobotTile
                        key={r.id}
                        name={r.title}
                        meta={r.maker}
                        images={[presetPreviewUrl(r.id), fallback(r)]}
                        disabled={!!busy}
                        drag={{ url: r.url, name: r.title }}
                        onInsert={() => void insert(r.id, r)}
                      />
                    ))}
                  </TileGrid>
                </section>
              );
            })}
          </div>
        )}
      </div>
      {menu && <ContextMenu x={menu.x} y={menu.y} items={menu.entries} onClose={() => setMenu(null)} />}
    </div>
  );
};

/** "unitreerobotics/unitree_ros" for a GitHub link, else the host */
function sourceOf(url: string): string {
  const m = /^https?:\/\/(?:raw\.githubusercontent\.com|github\.com)\/([^/]+)\/([^/]+)/.exec(url);
  if (m) return `${m[1]}/${m[2]}`;
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

const TileGrid: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="grid grid-cols-2 gap-x-[8px] gap-y-[12px] px-[4px] pt-1">{children}</div>
);

/** A Parts-style tile: 4:3 preview that zooms on hover, name, one meta line; click inserts */
const RobotTile: React.FC<{
  name: string;
  meta: string;
  /** Preview sources in order of preference (the next is tried when one fails to load) */
  images: Array<string | undefined>;
  disabled: boolean;
  onInsert: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  /** Dragged onto the canvas, the robot is imported where it's dropped */
  drag: { url: string; name: string };
}> = ({ name, meta, images, disabled, onInsert, onContextMenu, drag }) => {
  const sources = images.filter((s): s is string => !!s);
  const [failed, setFailed] = useState(0);
  const src = sources[failed];
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onInsert}
      onContextMenu={onContextMenu}
      draggable={!disabled}
      onDragStart={(e) => {
        e.dataTransfer.setData(ROBOT_DRAG_TYPE, JSON.stringify(drag));
        e.dataTransfer.effectAllowed = 'copy';
        const img = e.currentTarget.querySelector('img');
        if (img) e.dataTransfer.setDragImage(img, img.width / 2, img.height / 2);
      }}
      className="group w-full text-left cursor-default active:scale-[0.98] transition-transform duration-150"
    >
      <div className="preview aspect-[4/3] flex items-center justify-center">
        {src ? (
          <img
            src={src}
            alt=""
            draggable={false}
            onError={() => setFailed((n) => n + 1)}
            className="w-full h-full object-contain p-1.5 transition-transform duration-300 ease-[cubic-bezier(0.2,0,0,1)] group-hover:scale-[1.06]"
          />
        ) : (
          <RobotsIcon className="w-7 h-7 text-white/25" />
        )}
      </div>
      <div className="px-0.5 pt-2">
        <div className="text-[13px] font-medium text-white/90 truncate">{name}</div>
        <div className="text-[12px] text-white/40 truncate">{meta}</div>
      </div>
    </button>
  );
};
