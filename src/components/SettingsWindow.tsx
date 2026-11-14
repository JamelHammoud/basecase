import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  IconButton,
  NO_DRAG_REGION,
  useScrollFade,
  BotIcon,
  CloseIcon,
  GridIcon,
  HumanIcon,
  KeyboardIcon,
  PackageIcon,
  PrinterIcon,
} from '../design-system';
import type { PrintersState } from '../app/usePrinters';
import { AccountsPane } from './settings/AccountsPane';
import { AgentPane, type AgentPaneProps } from './settings/AgentPane';
import { BuildPane, type BuildPrefs } from './settings/BuildPane';
import { CanvasPane, type CanvasPaneProps } from './settings/CanvasPane';
import { PrintersPane } from './settings/PrintersPane';
import { ShortcutsList } from './ShortcutsList';
import { SETTINGS_PANES, type SettingsFocus, type SettingsPane } from '../app/settingsPanes';

const PANE_ICONS: Record<SettingsPane, React.ReactNode> = {
  canvas: <GridIcon className="w-4 h-4" />,
  agent: <BotIcon className="w-4 h-4" />,
  build: <PackageIcon className="w-4 h-4" />,
  printers: <PrinterIcon className="w-4 h-4" />,
  accounts: <HumanIcon className="w-4 h-4" />,
  shortcuts: <KeyboardIcon className="w-4 h-4" />,
};

export interface SettingsWindowProps extends CanvasPaneProps, AgentPaneProps {
  open: boolean;
  pane: SettingsPane;
  focus?: SettingsFocus;
  onPaneChange: (pane: SettingsPane) => void;
  onClose: () => void;
  buildPrefs: BuildPrefs;
  printers: PrintersState;
}

export const SettingsWindow: React.FC<SettingsWindowProps> = ({ open, pane, onPaneChange, onClose, ...props }) => {
  const fade = useScrollFade();
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    window.addEventListener('keydown', onKeyDown);

    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [pane]);

  if (!open) return null;

  const current = SETTINGS_PANES.find((p) => p.id === pane) ?? SETTINGS_PANES[0];

  return createPortal(
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center p-8 bg-black/55 animate-fade-in"
      style={NO_DRAG_REGION}
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Settings"
        className="w-full max-w-[860px] h-[620px] max-h-[86vh] flex rounded-[18px] sheet overflow-hidden animate-sheet-in"
      >
        <nav aria-label="Settings panes" className="w-[224px] shrink-0 bg-[#1c1c1c] p-[12px] flex flex-col gap-[2px]">
          <h2 className="px-[10px] h-[40px] flex items-center text-[15px] font-semibold text-white/90 mb-[4px]">
            Settings
          </h2>
          {SETTINGS_PANES.map((p) => {
            const isCurrent = p.id === current.id;

            return (
              <button
                key={p.id}
                type="button"
                onClick={() => onPaneChange(p.id)}
                aria-current={isCurrent ? 'page' : undefined}
                className={`group h-[34px] px-[10px] rounded-[8px] flex items-center gap-[10px] text-[13.5px] cursor-default transition-colors duration-150 ${
                  isCurrent
                    ? 'bg-white/[0.07] text-white/90'
                    : 'text-white/60 hover:text-white/90 hover:bg-white/[0.04]'
                }`}
              >
                <span
                  className={`shrink-0 transition-colors duration-150 ${
                    isCurrent ? 'text-white/90' : 'text-white/50 group-hover:text-white/60'
                  }`}
                >
                  {PANE_ICONS[p.id]}
                </span>
                {p.label}
              </button>
            );
          })}
        </nav>

        <div className="flex-1 min-w-0 flex flex-col">
          <header className="h-[64px] shrink-0 pl-[28px] pr-[20px] flex items-center justify-between">
            <h3 className="text-[20px] font-semibold text-white/90">{current.label}</h3>
            <IconButton
              icon={<CloseIcon className="w-4 h-4" />}
              title="Close"
              shortcut="Esc"
              onClick={onClose}
              size="sm"
            />
          </header>
          <div
            ref={(node) => {
              scrollRef.current = node;
              fade.ref(node);
            }}
            style={fade.style}
            className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-[28px] pt-[4px] pb-[28px]"
          >
            {current.id === 'canvas' && <CanvasPane {...props} />}
            {current.id === 'agent' && <AgentPane {...props} />}
            {current.id === 'build' && <BuildPane prefs={props.buildPrefs} />}
            {current.id === 'printers' && (
              <PrintersPane key={props.printers.loaded ? 'loaded' : 'loading'} state={props.printers} />
            )}
            {current.id === 'accounts' && <AccountsPane focus={props.focus} />}
            {current.id === 'shortcuts' && <ShortcutsList sculptEnabled={props.sculptEnabled} />}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
};
