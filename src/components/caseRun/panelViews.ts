import type React from 'react';
import type { PanelKind } from '../../cases/console/panelKinds';
import type { PanelViewProps } from './panelContext';
import { ButtonPanel } from './panels/ButtonPanel';
import { CameraPanel } from './panels/CameraPanel';
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
};
