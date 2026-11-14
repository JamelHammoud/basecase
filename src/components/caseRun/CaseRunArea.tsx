import React, { useRef, useState } from 'react';
import type { PlacedArea } from '../../cases/console/layout';
import { LAYOUT, PanelResizer, useScrollFade } from '../../design-system';
import { AREA_MAX, AREA_MIN } from '../../cases/console/format';
import { AREA_DEFAULT, type ConsoleEditor } from './consoleEditor';
import { ConsolePanel, DropLine } from './ConsolePanel';
import type { PanelContext } from './panelContext';
import { useAreaMenu } from './useAreaMenu';

interface CaseRunAreaProps {
  area: PlacedArea;
  side: 'before' | 'after';
  ctx: PanelContext;
  header: React.ReactNode;
  editor?: ConsoleEditor | null;
}

function ColumnLine({ edge }: { edge: 'before' | 'after' }) {
  return (
    <span
      data-testid="console-drop"
      className={`pointer-events-none absolute top-[12px] bottom-[12px] z-30 w-[2px] rounded-full bg-[#0d99ff] ${
        edge === 'before' ? 'left-[3px]' : 'right-[3px]'
      }`}
    />
  );
}

function useLiveSize(area: PlacedArea, editor: ConsoleEditor | null) {
  const [live, setLive] = useState<number | null>(null);
  const resizingRef = useRef(false);
  const latestRef = useRef<number | null>(null);

  const onResize = (size: number) => {
    if (!resizingRef.current) {
      editor?.resize(area.at, size);

      return;
    }

    latestRef.current = size;
    setLive(size);
  };

  const onResizingChange = (resizing: boolean) => {
    resizingRef.current = resizing;

    if (resizing) return;

    const size = latestRef.current;

    latestRef.current = null;
    setLive(null);

    if (size !== null && size !== area.size) editor?.resize(area.at, size);
  };

  return { size: live ?? area.size, onResize, onResizingChange };
}

function dropMarks(editor: ConsoleEditor | null, at: number) {
  const drop = editor?.drag?.drop;

  if (!drop || drop.area !== at) return { column: null, before: undefined };

  return 'column' in drop ? { column: drop.column, before: undefined } : { column: null, before: drop.before ?? null };
}

export const CaseRunArea: React.FC<CaseRunAreaProps> = ({ area, side, ctx, header, editor = null }) => {
  const { ref, style } = useScrollFade();
  const sizing = useLiveSize(area, editor);
  const menu = useAreaMenu(area, editor);
  const { column, before } = dropMarks(editor, area.at);

  return (
    <aside
      data-testid="case-run-area"
      data-console-area={area.at}
      onContextMenu={menu.open}
      className="relative h-full shrink-0 overflow-hidden"
      style={{ width: sizing.size + LAYOUT.panelGap }}
    >
      <div
        data-console-card
        className={`relative h-full flex flex-col overflow-hidden rounded-[12px] ${
          side === 'before' ? 'sidebar-surface' : 'bg-[#1f1f1f]'
        }`}
        style={{ width: sizing.size, marginLeft: side === 'after' ? LAYOUT.panelGap : 0 }}
      >
        {column && <ColumnLine edge={column} />}
        {area.last && header}
        <div ref={ref} style={style} className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
          {area.panels.map((panel) => (
            <ConsolePanel
              key={panel.id}
              panel={panel}
              ctx={ctx}
              editor={editor}
              renaming={menu.renaming === panel.id}
              onRenamed={menu.stopRenaming}
              dropAbove={before === panel.id}
            />
          ))}
          {before === null && (
            <div className="relative h-[8px]">
              <DropLine at="top" />
            </div>
          )}
        </div>
      </div>
      {editor && (
        <PanelResizer
          edge={side === 'before' ? 'right' : 'left'}
          width={sizing.size}
          min={AREA_MIN}
          max={AREA_MAX}
          defaultWidth={AREA_DEFAULT}
          onResize={sizing.onResize}
          onResizingChange={sizing.onResizingChange}
        />
      )}
      {menu.element}
    </aside>
  );
};
