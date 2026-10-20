import React, { useEffect, useRef, useState } from 'react';
import { ContextMenu, IconButton, PlusIcon } from '../design-system';
import { SceneTab, SceneTabHandlers } from './sceneTabs/SceneTab';
import { TabPreviewCard } from './sceneTabs/TabPreviewCard';
import { TAB_GAP } from './sceneTabs/tabGeometry';
import { tabMenuItems } from './sceneTabs/tabMenu';
import { useTabDrag } from './sceneTabs/useTabDrag';
import { useTabPreview } from './sceneTabs/useTabPreview';
import { useTabsFade } from './sceneTabs/useTabsFade';

export interface SceneTabInfo {
  id: string;
  name: string;
  partCount: number;
  busy: boolean;
  activity: string;
}

export interface SceneTabsProps {
  tabs: SceneTabInfo[];
  activeId: string;
  previews: Record<string, string>;
  canReopen: boolean;
  onSelect: (id: string) => void;
  onNew: () => void;
  onClose: (id: string) => void;
  onCloseOthers: (id: string) => void;
  onCloseRight: (id: string) => void;
  onDuplicate: (id: string) => void;
  onRename: (id: string, name: string) => void;
  onReorder: (from: number, to: number) => void;
  onReopen: () => void;
  onPreview?: (id: string) => void;
}

export const TAB_HEIGHT = 28;
export const TAB_TOP = 8;

const NO_DRAG = { WebkitAppRegion: 'no-drag' } as React.CSSProperties;

const isCloseButton = (target: EventTarget) => !!(target as HTMLElement).closest('[data-tab-close]');

function scrollSideways(el: HTMLDivElement | null, e: React.WheelEvent) {
  if (el && el.scrollWidth > el.clientWidth && Math.abs(e.deltaY) > Math.abs(e.deltaX)) el.scrollLeft += e.deltaY;
}

const NewSceneButton: React.FC<{ onNew: () => void }> = ({ onNew }) => (
  <div className="shrink-0 flex items-center pl-[2px]" style={NO_DRAG}>
    <IconButton
      icon={<PlusIcon className="w-4 h-4" />}
      title="New scene"
      shortcut="⌘T"
      className="w-[28px]! h-[28px]!"
      onClick={onNew}
    />
  </div>
);

export const SceneTabs: React.FC<SceneTabsProps> = ({
  tabs,
  activeId,
  previews,
  canReopen,
  onSelect,
  onNew,
  onClose,
  onCloseOthers,
  onCloseRight,
  onDuplicate,
  onRename,
  onReorder,
  onReopen,
  onPreview,
}) => {
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const tabEls = useRef(new Map<string, HTMLDivElement>());
  const [renaming, setRenaming] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const [initialIds] = useState(() => new Set(tabs.map((t) => t.id)));
  const { drag, startPress, movePress, endPress, isPressing } = useTabDrag({
    tabs,
    tabEls,
    scrollerRef,
    onReorder,
  });
  const { preview, hidePreview, queuePreview } = useTabPreview({ tabEls, onPreview });
  const fadeMask = useTabsFade({ lastTabId: tabs[tabs.length - 1]?.id ?? '', tabEls, scrollerRef });

  useEffect(() => {
    tabEls.current.get(activeId)?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
  }, [activeId, tabs.length]);

  const trackTab = (id: string, el: HTMLDivElement | null) => {
    if (el) tabEls.current.set(id, el);
    else tabEls.current.delete(id);
  };

  const pressTab = (e: React.PointerEvent<HTMLDivElement>, tab: SceneTabInfo, index: number) => {
    if (e.button === 1) {
      e.preventDefault();
      onClose(tab.id);

      return;
    }

    if (e.button !== 0 || renaming === tab.id || isCloseButton(e.target)) return;

    hidePreview();
    onSelect(tab.id);
    startPress(e, tab.id, index);
  };

  const handlersFor = (tab: SceneTabInfo, index: number): SceneTabHandlers => ({
    onPointerDown: (e) => pressTab(e, tab, index),
    onPointerMove: movePress,
    onPointerUp: endPress,
    onPointerEnter: () => queuePreview(tab.id, tab.id === activeId || !!drag || !!renaming || isPressing()),
    onPointerLeave: hidePreview,
    onStartRename: () => setRenaming(tab.id),
    onFinishRename: (name) => {
      if (name && name !== tab.name) onRename(tab.id, name);

      setRenaming(null);
    },
    onMenu: (e) => {
      e.preventDefault();
      hidePreview();
      setMenu({ id: tab.id, x: e.clientX, y: e.clientY });
    },
    onCloseTab: () => {
      hidePreview();
      onClose(tab.id);
    },
  });

  const previewTab = preview && tabs.find((t) => t.id === preview.id);
  const menuActions = {
    tabIds: tabs.map((t) => t.id),
    activeId,
    canReopen,
    onRename: setRenaming,
    onDuplicate,
    onNew,
    onReopen,
    onClose,
    onCloseOthers,
    onCloseRight,
  };

  return (
    <>
      <div className="flex items-stretch min-w-0 select-none" style={{ height: TAB_HEIGHT }}>
        <div
          ref={scrollerRef}
          role="tablist"
          aria-label="Open scenes"
          className="relative min-w-0 flex items-stretch overflow-x-auto overflow-y-hidden no-scrollbar"
          style={{ gap: TAB_GAP, maskImage: fadeMask, WebkitMaskImage: fadeMask }}
          onWheel={(e) => scrollSideways(scrollerRef.current, e)}
        >
          {tabs.map((tab, index) => (
            <SceneTab
              key={tab.id}
              tab={tab}
              active={tab.id === activeId}
              dragging={drag?.id === tab.id}
              isNew={!initialIds.has(tab.id)}
              renaming={renaming === tab.id}
              track={(el) => trackTab(tab.id, el)}
              handlers={handlersFor(tab, index)}
            />
          ))}
        </div>
        <NewSceneButton onNew={onNew} />
      </div>

      {previewTab && preview && <TabPreviewCard tab={previewTab} spot={preview} image={previews[previewTab.id]} />}

      {menu && (
        <ContextMenu x={menu.x} y={menu.y} items={tabMenuItems(menu.id, menuActions)} onClose={() => setMenu(null)} />
      )}
    </>
  );
};
