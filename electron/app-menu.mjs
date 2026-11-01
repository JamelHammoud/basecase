import { app, Menu } from 'electron';

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
  { id: 'isometric', label: 'Isometric', key: '1' },
  { id: 'top', label: 'Top', key: '2' },
  { id: 'front', label: 'Front', key: '3' },
  { id: 'right', label: 'Side', key: '4' },
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

function item(label, id, accelerator, extra = {}) {
  return { label, click: clickOnly(id), accelerator, registerAccelerator: false, ...extra };
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
    label: app.name,
    submenu: [
      { role: 'about' },
      ...updateItems(),
      separator,
      { label: 'Settings', accelerator: 'CmdOrCtrl+,', click: send('settings') },
      separator,
      { role: 'services' },
      separator,
      { role: 'hide' },
      { role: 'hideOthers' },
      { role: 'unhide' },
      separator,
      { role: 'quit' },
    ],
  };
}

function fileMenu(isMac) {
  return {
    label: 'File',
    submenu: [
      item('New Scene', 'new-scene', 'CmdOrCtrl+T'),
      item('Open Scene…', 'open-scenes', 'CmdOrCtrl+O'),
      item('Open Scene File', 'open-scene-file'),
      item('Reopen Closed Scene', 'reopen-tab', 'Shift+CmdOrCtrl+T', { enabled: state.canReopenTab }),
      separator,
      item('Export Scene', 'export-scene'),
      item('Export STL', 'export-stl', undefined, { enabled: state.hasParts }),
      ...(isMac ? [item('AirDrop', 'airdrop', undefined, { enabled: state.hasParts })] : []),
      item('Print', 'print', 'CmdOrCtrl+P', { enabled: state.hasParts }),
      separator,
      item('Add Reference Image', 'add-reference-image'),
      item('Import Mesh', 'import-mesh'),
      item('Import SVG', 'import-svg'),
      item('Import Robot', 'import-robot'),
      item('Import BVH', 'import-bvh'),
      separator,
      item('Close Scene', 'close-tab', 'CmdOrCtrl+W'),
      isMac ? { role: 'close', label: 'Close Window', accelerator: 'Shift+CmdOrCtrl+W' } : { role: 'quit' },
    ],
  };
}

function editMenu(isMac) {
  return {
    label: 'Edit',
    submenu: [
      { label: 'Undo', accelerator: 'CmdOrCtrl+Z', click: send('undo') },
      { label: 'Redo', accelerator: 'Shift+CmdOrCtrl+Z', click: send('redo') },
      separator,
      { role: 'cut' },
      { role: 'copy' },
      { role: 'paste' },
      { label: 'Select All', accelerator: 'CmdOrCtrl+A', click: send('select-all') },
      separator,
      item('Duplicate', 'duplicate', 'CmdOrCtrl+D', { enabled: state.hasSelection }),
      item('Delete', 'delete', 'Backspace', { enabled: state.hasSelection }),
      separator,
      item('Find Parts', 'find-parts', 'CmdOrCtrl+F'),
      ...(isMac ? [] : [separator, { label: 'Settings', accelerator: 'Ctrl+,', click: send('settings') }]),
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
      item('Command Menu', 'palette', 'CmdOrCtrl+K'),
      separator,
      {
        label: 'Camera',
        submenu: [
          ...CAMERA_VIEWS.map((v) => item(v.label, `view:${v.id}`, v.key)),
          separator,
          item('Zoom to Selection', 'zoom-selection', 'Z', { enabled: state.hasSelection }),
          item('Reset View', 'reset-view'),
        ],
      },
      {
        label: isMac ? 'Two-Finger Scroll' : 'Scroll',
        submenu: SCROLL_MODES.map(([label, mode]) =>
          item(label, `trackpad:${mode}`, undefined, { type: 'radio', checked: state.trackpadMode === mode }),
        ),
      },
      separator,
      item('Show Grid', 'toggle-grid', undefined, { type: 'checkbox', checked: state.grid }),
      item('Show Reference Images', 'toggle-reference-images', 'Shift+I', {
        type: 'checkbox',
        checked: state.referenceImages,
      }),
      separator,
      item('Show Sidebar', 'toggle-sidebar', 'CmdOrCtrl+B', { type: 'checkbox', checked: state.sidebar }),
      item('Show Inspector', 'toggle-inspector', 'CmdOrCtrl+I', { type: 'checkbox', checked: state.inspector }),
      separator,
      { role: 'togglefullscreen' },
      ...(process.defaultApp ? [separator, { role: 'reload' }, { role: 'toggleDevTools' }] : []),
    ],
  };
}

function windowMenu(isMac) {
  return {
    role: 'windowMenu',
    submenu: [
      { role: 'minimize' },
      { role: isMac ? 'zoom' : 'togglefullscreen' },
      separator,
      item('Show Previous Scene', 'prev-tab', 'Shift+CmdOrCtrl+[', { enabled: state.tabs.length > 1 }),
      item('Show Next Scene', 'next-tab', 'Shift+CmdOrCtrl+]', { enabled: state.tabs.length > 1 }),
      separator,
      ...state.tabs.map((t, i) =>
        item(t.name || 'Untitled', `tab:${t.id}`, i < 9 ? `CmdOrCtrl+${i + 1}` : undefined, {
          type: 'checkbox',
          checked: t.id === state.activeTab,
        }),
      ),
      ...(isMac ? [separator, { role: 'front' }] : []),
    ],
  };
}

function helpMenu(isMac) {
  const extras = [separator, ...updateItems(), { role: 'about', label: 'About Basecase' }];

  return {
    role: 'help',
    submenu: [item('Keyboard Shortcuts', 'shortcuts', '?'), ...(isMac ? [] : extras)],
  };
}

function rebuild() {
  const isMac = process.platform === 'darwin';
  const template = [
    ...(isMac ? [appMenu()] : []),
    fileMenu(isMac),
    editMenu(isMac),
    viewMenu(isMac),
    windowMenu(isMac),
    helpMenu(isMac),
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
