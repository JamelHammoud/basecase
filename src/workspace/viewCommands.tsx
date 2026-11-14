import type { ReactNode } from 'react';
import type { Command } from '../components/CommandPalette';
import { cameraViewsToggleLabel, toggleCameraViews } from '../cameras/cameraViewsStore';
import { hasCameraViews } from '../cameras/views';
import {
  CameraAddIcon,
  CameraIcon,
  GridIcon,
  HandIcon,
  KeyboardIcon,
  LayersIcon,
  LibraryIcon,
  ObjectsIcon,
  PackageIcon,
  PanelLeftIcon,
  PanelRightIcon,
  PlusIcon,
  RobotsIcon,
  RotateIcon,
  RunIcon,
  SearchIcon,
  SettingsIcon,
  ShapeIcon,
  SparklesIcon,
} from '../design-system';
import { CAMERA_VIEWS } from '../data/cameraViews';
import { SETTINGS_PANES } from '../app/settingsPanes';
import { CATEGORY_LABELS, PART_CATALOG, catalogKey, hardwareVariant } from '../data/catalog';
import { HARDWARE_BY_TYPE, hardwareName } from '../data/hardware';
import type { TrackpadGestureMode } from '../types/robotics';
import { NEXT_SCROLL_MODE } from '../utils/scrollModes';
import type { CommandInputs } from './sceneCommands';
import { paletteCommand, selectionActions } from './partActions';
import { showLeftTab, showPartsSection } from './showView';
import { keyFor } from '../app/shortcuts';

const ic = 'w-4 h-4';

const PARTS_SECTIONS = [
  {
    section: 'Robots',
    label: 'Show Robots',
    icon: <RobotsIcon className={ic} />,
    keywords: 'import urdf humanoid arm',
  },
  { section: 'Objects', label: 'Show Objects', icon: <ObjectsIcon className={ic} />, keywords: 'simready props world' },
] as const;

const SIDEBAR_VIEWS = [
  { tab: 'layers', label: 'Show Layers', icon: <LayersIcon className={ic} />, keywords: 'outline tree groups hide' },
  { tab: 'library', label: 'Show Library', icon: <LibraryIcon className={ic} />, keywords: 'saved models reuse' },
] as const;

export const sceneHasCameraViews = ({ core, actions }: Pick<CommandInputs, 'core' | 'actions'>) =>
  hasCameraViews(core.parts, actions.cameras.cameras, core.simTraining.sim.status !== 'off');

function panelCommands({ core, ui }: CommandInputs): Command[] {
  const { studio, tool } = core;

  return [
    ...CAMERA_VIEWS.map((v) => ({
      id: `view-${v.id}`,
      group: 'View',
      label: `${v.label} View`,
      shortcut: keyFor(`view:${v.id}`),
      icon: <ShapeIcon className={ic} />,
      keywords: 'camera',
      run: () => ui.setCameraView(v.id),
    })),
    {
      id: 'find-parts',
      group: 'View',
      label: 'Find Parts',
      shortcut: keyFor('find-parts'),
      icon: <SearchIcon className={ic} />,
      keywords: 'search catalog servo screw component hardware',
      run: ui.findParts,
    },
    {
      id: 'toggle-left',
      group: 'View',
      label: studio.isLeftOpen ? 'Hide Sidebar' : 'Show Sidebar',
      shortcut: keyFor('toggle-sidebar'),
      icon: <PanelLeftIcon className={ic} />,
      run: ui.toggleLeft,
    },
    {
      id: 'toggle-right',
      group: 'View',
      label: studio.isRightOpen ? 'Hide Inspector' : 'Show Inspector',
      shortcut: keyFor('toggle-inspector'),
      icon: <PanelRightIcon className={ic} />,
      run: ui.toggleRight,
    },
    ...PARTS_SECTIONS.map((v) => ({
      id: `show-${v.section.toLowerCase()}`,
      group: 'Panels',
      label: v.label,
      icon: v.icon,
      keywords: v.keywords,
      run: () => showPartsSection(core, v.section),
    })),
    ...SIDEBAR_VIEWS.map((v) => ({
      id: `show-${v.tab}`,
      group: 'Panels',
      label: v.label,
      icon: v.icon,
      keywords: v.keywords,
      run: () => showLeftTab(core, v.tab),
    })),
    ...(core.posing.hasRig
      ? [
          {
            id: 'show-simulate',
            group: 'Panels',
            label: 'Show Simulate',
            icon: <RunIcon className={ic} />,
            keywords: 'mujoco physics sim train policy',
            run: () => tool.openRightTab('sim'),
          },
        ]
      : []),
    {
      id: 'build',
      group: 'Panels',
      label: 'Show Build',
      icon: <PackageIcon className={ic} />,
      keywords: 'bom bill of materials budget buy price amazon print filament',
      run: () => tool.openRightTab('build'),
    },
    {
      id: 'agent',
      group: 'Panels',
      label: 'Show Agent',
      icon: <SparklesIcon className={ic} />,
      keywords: 'ai chat',
      run: () => tool.openRightTab('acp'),
    },
  ];
}

const SCROLL_COMMANDS: Record<TrackpadGestureMode, { label: string; icon: ReactNode }> = {
  'orbit-scroll': { label: 'Scroll to Orbit', icon: <RotateIcon className={ic} /> },
  'pan-scroll': { label: 'Scroll to Pan', icon: <HandIcon className={ic} /> },
  'zoom-scroll': { label: 'Scroll to Zoom', icon: <SearchIcon className={ic} /> },
};

function displayCommands(inputs: CommandInputs): Command[] {
  const { core, ui, actions } = inputs;
  const { studio } = core;
  const act = selectionActions(inputs);
  const next = SCROLL_COMMANDS[NEXT_SCROLL_MODE[studio.trackpadMode]];

  return [
    {
      id: 'toggle-grid',
      group: 'View',
      label: studio.showGrid ? 'Hide Grid' : 'Show Grid',
      icon: <GridIcon className={ic} />,
      run: ui.toggleGrid,
    },
    ...(sceneHasCameraViews({ core, actions })
      ? [
          {
            id: 'toggle-camera-views',
            group: 'View',
            label: cameraViewsToggleLabel(),
            shortcut: keyFor('toggle-camera-views'),
            icon: <CameraIcon className={ic} />,
            keywords: 'camera feed wrist head fisheye robot eyes',
            run: toggleCameraViews,
          },
        ]
      : []),
    {
      id: 'add-camera-view',
      group: 'Scene',
      label: 'Add Camera View',
      icon: <CameraAddIcon className={ic} />,
      keywords: 'camera stationary fixed outside shot frame',
      run: actions.cameras.add,
    },
    paletteCommand(act.zoom, 'View'),
    paletteCommand(act.resetView, 'View'),
    {
      id: 'toggle-trackpad',
      group: 'View',
      label: next.label,
      icon: next.icon,
      keywords: 'trackpad two-finger gesture mouse wheel',
      run: ui.toggleTrackpad,
    },
    {
      id: 'settings',
      group: 'App',
      label: 'Settings',
      shortcut: keyFor('settings'),
      icon: <SettingsIcon className={ic} />,
      keywords: 'preferences grid snap trackpad',
      run: () => studio.openSettings(),
    },
    ...SETTINGS_PANES.filter((pane) => pane.id !== 'shortcuts').map((pane) => ({
      id: `${pane.id}-settings`,
      group: 'App',
      label: `${pane.label} Settings`,
      icon: <SettingsIcon className={ic} />,
      keywords: pane.keywords,
      run: () => studio.openSettings(pane.id),
    })),
    {
      id: 'shortcuts',
      group: 'App',
      label: 'Keyboard Shortcuts',
      shortcut: keyFor('shortcuts'),
      icon: <KeyboardIcon className={ic} />,
      run: () => studio.openSettings('shortcuts'),
    },
  ];
}

function catalogCommands({ core, actions }: CommandInputs): Command[] {
  const { creation } = actions;

  return [
    ...PART_CATALOG.filter((item) => !item.hardware).map((item) => ({
      id: `add-${catalogKey(item)}`,
      group: 'Add Part',
      label: item.name,
      icon: <PlusIcon className={ic} />,
      keywords: `${CATEGORY_LABELS[item.category].label} ${item.description} ${item.keywords ?? ''}`,
      run: () => creation.addCatalogItem(item),
    })),
    ...PART_CATALOG.filter((item) => item.hardware).flatMap((item) =>
      HARDWARE_BY_TYPE[item.hardware!.type].sizes.map((size) => {
        const v = hardwareVariant(item, size);

        return {
          id: `add-${catalogKey(item)}-${size}`,
          group: 'Add Hardware',
          label: hardwareName(v.hardware!),
          icon: <PlusIcon className={ic} />,
          keywords: `hardware ${size.toLowerCase()} ${item.description}`,
          run: () => creation.addCatalogItem(v),
        };
      }),
    ),
    ...core.studio.customModels.map((m) => ({
      id: `model-${m.id}`,
      group: 'Insert Model',
      label: m.name,
      icon: <ShapeIcon className={ic} />,
      run: () => creation.placeCustomModel(m),
    })),
  ];
}

export const viewCommands = (inputs: CommandInputs): Command[] => [
  ...panelCommands(inputs),
  ...displayCommands(inputs),
  ...catalogCommands(inputs),
];
