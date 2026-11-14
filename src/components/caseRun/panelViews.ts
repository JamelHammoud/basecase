import type React from 'react';
import type { PanelKind } from '../../cases/console/panelKinds';
import type { PanelViewProps } from './panelContext';
import { ButtonPanel } from './panels/ButtonPanel';
import { CameraPanel } from './panels/CameraPanel';
import { CodePanel } from './panels/CodePanel';
import { DiagnosticsPanel } from './panels/DiagnosticsPanel';
import { LogPanel } from './panels/LogPanel';
import { MessagePanel } from './panels/MessagePanel';
import { StatesPanel } from './panels/StatesPanel';
import { ListPanel } from './panels/ListPanel';
import { MapPanel } from './panels/MapPanel';
import { PlotPanel } from './panels/PlotPanel';
import { TablePanel } from './panels/TablePanel';
import { TextPanel } from './panels/TextPanel';
import { ValuePanel } from './panels/ValuePanel';

export const PANEL_VIEWS: { [K in PanelKind]: React.FC<PanelViewProps<K>> } = {
  camera: CameraPanel,
  value: ValuePanel,
  plot: PlotPanel,
  table: TablePanel,
  button: ButtonPanel,
  list: ListPanel,
  text: TextPanel,
  map: MapPanel,
  code: CodePanel,
  log: LogPanel,
  diagnostics: DiagnosticsPanel,
  message: MessagePanel,
  states: StatesPanel,
};
