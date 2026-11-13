import { Menu } from 'electron';
import { APP_DISPLAY_NAME } from './appName.mjs';
import { acceleratorOf, menuAccelerator, tabChord } from './shortcutKeys.mjs';

const DEFAULT_STATE = {
  sidebar: true,
  inspector: true,
  grid: true,
  referenceImages: true,
  trackpadMode: 'orbit-scroll',
  hasSelection: false,
  hasParts: false,
  tabs: [],
  activeTab: '',
  canReopenTab: false,
};

const CAMERA_VIEWS = [
  { id: 'isometric', label: 'Isometric' },
  { id: 'top', label: 'Top' },
  { id: 'front', label: 'Front' },
  { id: 'right', label: 'Side' },
];

let state = { ...DEFAULT_STATE };
let getWindow = () => null;
let checkForUpdates = null;
let betaUpdates = null;

export function installAppMenu(windowGetter, { onCheckForUpdates = null, betaUpdates: beta = null } = {}) {
  getWindow = windowGetter;
  checkForUpdates = onCheckForUpdates;
  betaUpdates = beta;
  rebuild();
}

export function popupAppMenu(window, at) {
  const menu = Menu.getApplicationMenu();

  if (!menu || !window || window.isDestroyed()) return;

  menu.popup({ window, x: Math.round(Number(at?.x) || 0), y: Math.round(Number(at?.y) || 0) });
}

export function updateAppMenuState(next) {
  state = { ...state, ...next };
  rebuild();
}

function send(id) {
  return () => {
    const win = getWindow();

    if (win && !win.isDestroyed()) win.webContents.send('menu:command', id);
  };
}

function clickOnly(id) {
  return (_item, _window, event) => {
    if (event?.triggeredByAccelerator) return;

    send(id)();
  };
}

function item(label, id, extra = {}) {
  return { id, label, click: clickOnly(id), accelerator: menuAccelerator(id), registerAccelerator: false, ...extra };
}

function sent(label, id) {
  return { id, label, accelerator: menuAccelerator(id), click: send(id) };
}

const separator = { type: 'separator' };

function updateItems() {
  const check = checkForUpdates ? [{ label: 'Check for Updates', click: () => checkForUpdates() }] : [];
  const beta = betaUpdates
    ? [
        {
          label: 'Get Beta Updates',
          type: 'checkbox',
          checked: betaUpdates.get(),
          click: (menuItem) => betaUpdates.set(menuItem.checked),
        },
      ]
    : [];

  return [...check, ...beta];
}

function appMenu() {
  return {
    label: APP_DISPLAY_NAME,
    submenu: [
      { role: 'about', label: `About ${APP_DISPLAY_NAME}` },
      ...updateItems(),
      separator,
      sent('Settings', 'settings'),
      separator,
      { role: 'services' },
      separator,
      { role: 'hide', label: `Hide ${APP_DISPLAY_NAME}` },
      { role: 'hideOthers' },
      { role: 'unhide' },
      separator,
      { role: 'quit', label: `Quit ${APP_DISPLAY_NAME}` },
    ],
  };
}

function fileMenu(isMac) {
  return {
    label: 'File',
    submenu: [
      item('New Scene', 'new-scene'),
      item('Show Scenes', 'open-scenes'),
      item('Open Scene File', 'open-scene-file'),
      item('Reopen Closed Scene', 'reopen-tab', { enabled: state.canReopenTab }),
      separator,
      item('Export Scene', 'export-scene'),
      item('Export STL', 'export-stl', { enabled: state.hasParts }),
      ...(isMac ? [item('AirDrop', 'airdrop', { enabled: state.hasParts })] : []),
      item('Print', 'print', { enabled: state.hasParts }),
      separator,
      item('Add Reference Image', 'add-reference-image'),
      item('Import', 'import'),
      item('Import Robot', 'import-robot'),
      separator,
      item('Close Scene', 'close-tab'),
      isMac ? { role: 'close', label: 'Close Window', accelerator: 'Shift+CmdOrCtrl+W' } : { role: 'quit' },
    ],
  };
}

function editMenu(isMac) {
  return {
    label: 'Edit',
    submenu: [
      sent('Undo', 'undo'),
      sent('Redo', 'redo'),
      separator,
      { role: 'cut' },
      { role: 'copy' },
      { role: 'paste' },
      sent('Select All', 'select-all'),
      separator,
      item('Duplicate', 'duplicate', { enabled: state.hasSelection }),
      item('Delete', 'delete', { enabled: state.hasSelection }),
      separator,
      item('Find Parts', 'find-parts'),
      ...(isMac ? [] : [separator, sent('Settings', 'settings')]),
    ],
  };
}

const SCROLL_MODES = [
  ['Orbit', 'orbit-scroll'],
  ['Pan', 'pan-scroll'],
  ['Zoom', 'zoom-scroll'],
];

function viewMenu(isMac) {
  return {
    label: 'View',
    submenu: [
      item('Command Menu', 'palette'),
      separator,
      {
        label: 'Camera',
        submenu: [
          ...CAMERA_VIEWS.map((v) => item(v.label, `view:${v.id}`)),
          separator,
          item('Zoom to Selection', 'zoom-selection', { enabled: state.hasSelection }),
          item('Reset View', 'reset-view'),
        ],
      },
      {
        label: isMac ? 'Two-Finger Scroll' : 'Scroll',
        submenu: SCROLL_MODES.map(([label, mode]) =>
          item(label, `trackpad:${mode}`, { type: 'radio', checked: state.trackpadMode === mode }),
        ),
      },
      separator,
      item('Show Grid', 'toggle-grid', { type: 'checkbox', checked: state.grid }),
      item('Show Reference Images', 'toggle-reference-images', {
        type: 'checkbox',
        checked: state.referenceImages,
      }),
      separator,
      item('Show Sidebar', 'toggle-sidebar', { type: 'checkbox', checked: state.sidebar }),
      item('Show Inspector', 'toggle-inspector', { type: 'checkbox', checked: state.inspector }),
      separator,
      { role: 'togglefullscreen' },
      ...(process.defaultApp ? [separator, { role: 'reload' }, { role: 'toggleDevTools' }] : []),
    ],
  };
}

function tabAccelerator(index, count) {
  const chord = tabChord(index, count);

  return chord && acceleratorOf(chord);
}

function windowMenu(isMac) {
  return {
    role: 'windowMenu',
    submenu: [
      { role: 'minimize' },
      { role: isMac ? 'zoom' : 'togglefullscreen' },
      separator,
      item('Show Previous Scene', 'prev-tab', { enabled: state.tabs.length > 1 }),
      item('Show Next Scene', 'next-tab', { enabled: state.tabs.length > 1 }),
      separator,
      ...state.tabs.map((t, i) =>
        item(t.name || 'Untitled', `tab:${t.id}`, {
          accelerator: tabAccelerator(i, state.tabs.length),
          type: 'checkbox',
          checked: t.id === state.activeTab,
        }),
      ),
      ...(isMac ? [separator, { role: 'front' }] : []),
    ],
  };
}

function helpMenu(isMac) {
  const extras = [separator, ...updateItems(), { role: 'about', label: `About ${APP_DISPLAY_NAME}` }];

  return {
    role: 'help',
    submenu: [item('Keyboard Shortcuts', 'shortcuts'), ...(isMac ? [] : extras)],
  };
}

export const menuTemplate = (isMac) => [
  ...(isMac ? [appMenu()] : []),
  fileMenu(isMac),
  editMenu(isMac),
  viewMenu(isMac),
  windowMenu(isMac),
  helpMenu(isMac),
];

function rebuild() {
  Menu.setApplicationMenu(Menu.buildFromTemplate(menuTemplate(process.platform === 'darwin')));
}
