import type { ReactNode } from 'react';
import type { Command } from '../components/CommandPalette';
import { cameraViewsToggleLabel, toggleCameraViews } from '../cameras/cameraViewsStore';
import { hasCameraViews } from '../cameras/views';
import {
  CameraAddIcon,
  CameraIcon,
  CrosshairIcon,
  GridIcon,
  HandIcon,
  KeyboardIcon,
  PackageIcon,
  PanelLeftIcon,
  PanelRightIcon,
  PlusIcon,
  RotateIcon,
  SearchIcon,
  SettingsIcon,
  ShapeIcon,
  SparklesIcon,
} from '../design-system';
import { CAMERA_VIEWS } from '../data/cameraViews';
import { CATEGORY_LABELS, PART_CATALOG, catalogKey, hardwareVariant } from '../data/catalog';
import { HARDWARE_BY_TYPE, hardwareName } from '../data/hardware';
import type { TrackpadGestureMode } from '../types/robotics';
import { NEXT_SCROLL_MODE } from '../utils/scrollModes';
import { IS_WEB_DEMO } from '../utils/platform/webDemo';
import type { CommandInputs } from './sceneCommands';

const ic = 'w-4 h-4';

export const sceneHasCameraViews = ({ core, actions }: Pick<CommandInputs, 'core' | 'actions'>) =>
  hasCameraViews(core.parts, actions.cameras.cameras, core.simTraining.sim.status !== 'off');

function panelCommands({ core, ui }: CommandInputs): Command[] {
  const { studio, tool } = core;

  return [
    ...CAMERA_VIEWS.map((v) => ({
      id: `view-${v.id}`,
      group: 'View',
      label: `${v.label} View`,
      shortcut: v.shortcut,
      icon: <ShapeIcon className={ic} />,
      keywords: 'camera',
      run: () => ui.setCameraView(v.id),
    })),
    {
      id: 'find-parts',
      group: 'View',
      label: 'Find Parts',
      shortcut: '⌘F',
      icon: <SearchIcon className={ic} />,
      keywords: 'search catalog servo screw component hardware',
      run: ui.findParts,
    },
    {
      id: 'toggle-left',
      group: 'View',
      label: studio.isLeftOpen ? 'Hide Sidebar' : 'Show Sidebar',
      shortcut: '⌘B',
      icon: <PanelLeftIcon className={ic} />,
      run: ui.toggleLeft,
    },
    {
      id: 'toggle-right',
      group: 'View',
      label: studio.isRightOpen ? 'Hide Inspector' : 'Show Inspector',
      shortcut: '⌘I',
      icon: <PanelRightIcon className={ic} />,
      run: ui.toggleRight,
    },
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

function displayCommands({ core, ui, actions }: CommandInputs): Command[] {
  const { studio } = core;
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
            shortcut: '⇧V',
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
    {
      id: 'zoom-selection',
      group: 'View',
      label: 'Zoom to Selection',
      shortcut: 'Z',
      icon: <CrosshairIcon className={ic} />,
      run: ui.focusSelected,
    },
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
      shortcut: '⌘,',
      icon: <SettingsIcon className={ic} />,
      keywords: 'preferences grid snap trackpad',
      run: () => studio.openSettings(),
    },
    ...(IS_WEB_DEMO
      ? []
      : [
          {
            id: 'agent-settings',
            group: 'App',
            label: 'Agent Settings',
            icon: <SettingsIcon className={ic} />,
            keywords: 'claude offline command target height',
            run: () => studio.openSettings('agent'),
          },
        ]),
    {
      id: 'currency-settings',
      group: 'App',
      label: 'Currency Settings',
      icon: <SettingsIcon className={ic} />,
      keywords: 'currency money price budget euro pound yen dollar region',
      run: () => studio.openSettings('build'),
    },
    {
      id: 'shortcuts',
      group: 'App',
      label: 'Keyboard Shortcuts',
      shortcut: '?',
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
