import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AcpStatusInfo, MeasureUnit, TrackpadGestureMode } from '../types/robotics';
import { AGENT_PROFILES } from '../agent/agentKinds';
import {
  Button,
  IconButton,
  Kbd,
  MetaLine,
  NO_DRAG_REGION,
  NumberInput,
  SegmentedControl,
  Switch,
  TextInput,
  useScrollFade,
  BotIcon,
  CloseIcon,
  GridIcon,
  KeyboardIcon,
  MouseIcon,
  PackageIcon,
  PanelsIcon,
  PrinterIcon,
  RefreshIcon,
  WebIcon,
} from '../design-system';
import type { PrintersState } from '../app/usePrinters';
import { BuildPane } from './settings/BuildPane';
import { PrintersPane } from './settings/PrintersPane';
import { RegionPane } from './settings/RegionPane';
import { SettingsGroup as Group, SettingsRow as Row } from './SettingsRows';
import { ShortcutsList } from './ShortcutsList';

export type SettingsPane = 'canvas' | 'navigation' | 'layout' | 'region' | 'agent' | 'build' | 'printers' | 'shortcuts';

const PANES: Array<{ id: SettingsPane; label: string; icon: React.ReactNode }> = [
  { id: 'canvas', label: 'Canvas', icon: <GridIcon className="w-4 h-4" /> },
  { id: 'navigation', label: 'Navigation', icon: <MouseIcon className="w-4 h-4" /> },
  { id: 'layout', label: 'Layout', icon: <PanelsIcon className="w-4 h-4" /> },
  { id: 'region', label: 'Region', icon: <WebIcon className="w-4 h-4" /> },
  { id: 'agent', label: 'Agent', icon: <BotIcon className="w-4 h-4" /> },
  { id: 'build', label: 'Build', icon: <PackageIcon className="w-4 h-4" /> },
  { id: 'printers', label: 'Printers', icon: <PrinterIcon className="w-4 h-4" /> },
  { id: 'shortcuts', label: 'Shortcuts', icon: <KeyboardIcon className="w-4 h-4" /> },
];

const MOVE_SNAP_STEPS = ['0', '1', '2', '5', '10'];
const ROTATE_SNAP_STEPS = ['0', '5', '15', '45', '90'];
const MEASURE_UNITS: Array<{ value: MeasureUnit; label: string }> = [
  { value: 'metric', label: 'Metric' },
  { value: 'imperial', label: 'Imperial' },
];

export interface SettingsWindowProps {
  open: boolean;
  pane: SettingsPane;
  onPaneChange: (pane: SettingsPane) => void;
  onClose: () => void;
  showGrid: boolean;
  onShowGrid: (v: boolean) => void;
  sculptEnabled: boolean;
  onSculptEnabled: (v: boolean) => void;
  autoGuide: boolean;
  onAutoGuide: (v: boolean) => void;
  snapStepMm: number;
  onSnapStep: (mm: number) => void;
  snapAngleDeg: number;
  onSnapAngle: (deg: number) => void;
  measureUnit: MeasureUnit;
  onMeasureUnit: (unit: MeasureUnit) => void;
  showReferenceImages: boolean;
  onShowReferenceImages: (v: boolean) => void;
  trackpadMode: TrackpadGestureMode;
  onTrackpadMode: (mode: TrackpadGestureMode) => void;
  isLeftOpen: boolean;
  onLeftOpen: (v: boolean) => void;
  isRightOpen: boolean;
  onRightOpen: (v: boolean) => void;
  panelWidths: { left: number; right: number };
  onResetPanelWidths: () => void;
  acpStatus: AcpStatusInfo;
  onReconnectAcp: (command?: string) => Promise<void>;
  targetHeightMm: number;
  onTargetHeight: (mm: number) => void;
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

  const current = PANES.find((p) => p.id === pane) ?? PANES[0];

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
        className="w-full max-w-[860px] h-[620px] max-h-[86vh] flex rounded-[18px] bg-[#222222] shadow-[0_0_0_0.5px_rgba(0,0,0,0.6),0_32px_80px_-12px_rgba(0,0,0,0.6),0_8px_24px_rgba(0,0,0,0.3)] overflow-hidden animate-sheet-in"
      >
        <nav aria-label="Settings panes" className="w-[224px] shrink-0 bg-[#1c1c1c] p-[12px] flex flex-col gap-[2px]">
          <h2 className="px-[10px] h-[40px] flex items-center text-[15px] font-semibold text-white/90 mb-[4px]">
            Settings
          </h2>
          {PANES.map((p) => {
            const isCurrent = p.id === pane;

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
                    isCurrent ? 'text-white/90' : 'text-white/40 group-hover:text-white/70'
                  }`}
                >
                  {p.icon}
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
            {pane === 'canvas' && <CanvasPane {...props} />}
            {pane === 'navigation' && <NavigationPane {...props} />}
            {pane === 'layout' && <LayoutPane {...props} />}
            {pane === 'region' && <RegionPane />}
            {pane === 'agent' && <AgentPane {...props} />}
            {pane === 'build' && <BuildPane autoGuide={props.autoGuide} onAutoGuide={props.onAutoGuide} />}
            {pane === 'printers' && (
              <PrintersPane key={props.printers.printers.length ? 'loaded' : 'empty'} state={props.printers} />
            )}
            {pane === 'shortcuts' && <ShortcutsList sculptEnabled={props.sculptEnabled} />}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
};

type PaneProps = Omit<SettingsWindowProps, 'open' | 'pane' | 'onPaneChange' | 'onClose'>;

const Unit: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span className="text-white/40">{children}</span>
);

const CanvasPane: React.FC<PaneProps> = (p) => (
  <>
    <Group title="Display">
      <Row label="Show grid">
        <Switch checked={p.showGrid} onChange={p.onShowGrid} />
      </Row>
      <Row label="Show reference images" shortcut="⇧I">
        <Switch checked={p.showReferenceImages} onChange={p.onShowReferenceImages} />
      </Row>
    </Group>
    <Group title="Snapping">
      <Row
        label={
          <>
            Move <Unit>mm</Unit>
          </>
        }
        hint="Hold ⇧ while dragging to move freely"
      >
        <SegmentedControl
          className="w-[240px]"
          value={String(p.snapStepMm)}
          onChange={(v) => p.onSnapStep(Number(v))}
          options={MOVE_SNAP_STEPS.map((v) => ({ value: v, label: v === '0' ? 'Off' : v }))}
        />
      </Row>
      <Row label="Rotate" hint="Hold ⇧ while dragging to rotate freely">
        <SegmentedControl
          className="w-[240px]"
          value={String(p.snapAngleDeg)}
          onChange={(v) => p.onSnapAngle(Number(v))}
          options={ROTATE_SNAP_STEPS.map((v) => ({ value: v, label: v === '0' ? 'Off' : `${v}°` }))}
        />
      </Row>
    </Group>
    <Group title="Measure">
      <Row label="Units" hint="Hold ⌥ to measure vertically">
        <SegmentedControl<MeasureUnit>
          className="w-[240px]"
          value={p.measureUnit}
          onChange={p.onMeasureUnit}
          options={MEASURE_UNITS}
        />
      </Row>
    </Group>
    <Group title="Experimental">
      <Row label="Sculpt tool" hint="Adds Sculpt (C) to the toolbar">
        <Switch checked={p.sculptEnabled} onChange={p.onSculptEnabled} />
      </Row>
    </Group>
  </>
);

const NavigationPane: React.FC<PaneProps> = (p) => (
  <>
    <Group title="Trackpad">
      <Row
        label="Two-finger scroll"
        hint={
          p.trackpadMode === 'orbit-scroll'
            ? 'Hold ⇧ while scrolling to pan. Pinch to zoom.'
            : 'Drag the canvas to orbit. Pinch to zoom.'
        }
      >
        <SegmentedControl<TrackpadGestureMode>
          className="w-[180px]"
          value={p.trackpadMode}
          onChange={p.onTrackpadMode}
          options={[
            { value: 'orbit-scroll', label: 'Orbit' },
            { value: 'pan-scroll', label: 'Pan' },
          ]}
        />
      </Row>
      <Row label="Pan" hint="Works in either mode">
        <span className="flex items-center gap-[6px] text-[12.5px] text-white/45">
          <Kbd>Space</Kbd> drag
        </span>
      </Row>
    </Group>
    <Group title="Camera">
      {CAMERA_KEYS.map(([label, key]) => (
        <Row key={key} label={label}>
          <Kbd>{key}</Kbd>
        </Row>
      ))}
      <Row label="Zoom to selection">
        <Kbd>Z</Kbd>
      </Row>
    </Group>
  </>
);

const LayoutPane: React.FC<PaneProps> = (p) => (
  <Group title="Panels">
    <Row label="Show sidebar" shortcut="⌘B">
      <Switch checked={p.isLeftOpen} onChange={p.onLeftOpen} />
    </Row>
    <Row label="Show inspector" shortcut="⌘I">
      <Switch checked={p.isRightOpen} onChange={p.onRightOpen} />
    </Row>
    <Row
      label="Panel widths"
      hint={<MetaLine items={[`Sidebar ${p.panelWidths.left} px`, `Inspector ${p.panelWidths.right} px`]} />}
    >
      <Button size="sm" onClick={p.onResetPanelWidths}>
        Reset
      </Button>
    </Row>
  </Group>
);

const CAMERA_KEYS: Array<[string, string]> = [
  ['Isometric', '1'],
  ['Top', '2'],
  ['Front', '3'],
  ['Side', '4'],
];

const agentOfCommand = (command: string) => AGENT_PROFILES.find((p) => p.command === command);

function agentStatusText(status: AcpStatusInfo) {
  if (status.connecting) return 'Connecting…';

  if (status.connected && status.signIn) return `Sign in to ${status.agentName} from the Agent tab`;

  return status.connected ? `Connected to ${status.agentName}` : status.error || 'Not connected';
}

const AgentPane: React.FC<PaneProps> = (p) => {
  const [command, setCommand] = useState(p.acpStatus.agentCommand);
  const agent = agentOfCommand(command);

  return (
    <>
      <Group title="Agent">
        <Row label="Run with" hint={agent?.hint ?? 'Custom ACP agent'}>
          <SegmentedControl<string>
            className="w-[320px]"
            value={agent?.kind ?? ''}
            onChange={(kind) => {
              const cmd = AGENT_PROFILES.find((profile) => profile.kind === kind)?.command;

              if (!cmd) return;

              setCommand(cmd);
              p.onReconnectAcp(cmd);
            }}
            options={AGENT_PROFILES.map((profile) => ({ value: profile.kind, label: profile.label }))}
          />
        </Row>
        <Row
          stacked
          label="Command"
          hint={
            <span
              className={`break-words ${p.acpStatus.connecting || (p.acpStatus.connected && !p.acpStatus.signIn) ? '' : 'text-amber-200/80'}`}
            >
              {agentStatusText(p.acpStatus)}
            </span>
          }
        >
          <div className="flex gap-[6px]">
            <TextInput
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') p.onReconnectAcp(command);
              }}
              aria-label="Agent command"
              className="font-mono text-[12px]"
            />
            <IconButton
              icon={<RefreshIcon className="w-3.5 h-3.5" />}
              title="Reconnect"
              onClick={() => p.onReconnectAcp(command)}
            />
          </div>
        </Row>
      </Group>
      <Group title="Models">
        <Row label="Target height" hint="Overall height of what the agent builds. 0 lets it estimate.">
          <div className="w-[120px]">
            <NumberInput
              label="H"
              title="Target height"
              value={p.targetHeightMm}
              onChange={p.onTargetHeight}
              min={0}
              max={3000}
              precision={0}
              unit="mm"
            />
          </div>
        </Row>
      </Group>
    </>
  );
};
