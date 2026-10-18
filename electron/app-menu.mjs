import { app, Menu } from 'electron';

/**
 * Native macOS menu bar. Items send `menu:command` ids to the renderer, which runs them
 * (the menu command effect in App.tsx). The renderer reports checkmarks and enabled state
 * back through `menu:state`.
 *
 * Shortcuts the renderer already handles are display-only (`registerAccelerator: false`)
 * so a keypress never runs twice or fires while typing. Undo, Redo and Select All stay
 * registered so they keep working inside text fields.
 */

const DEFAULT_STATE = {
  sidebar: true,
  inspector: true,
  grid: true,
  referenceImages: true,
  trackpadMode: 'orbit-scroll',
  hasSelection: false,
  hasParts: false,
  // Open scene tabs, listed in the Window menu
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

export function installAppMenu(windowGetter) {
  getWindow = windowGetter;
  rebuild();
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

/** A menu item whose shortcut is handled by the renderer (shown, not registered). */
function item(label, id, accelerator, extra = {}) {
  return { label, click: send(id), accelerator, registerAccelerator: false, ...extra };
}

const separator = { type: 'separator' };

function rebuild() {
  const isMac = process.platform === 'darwin';
  const template = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: 'about' },
              separator,
              { label: 'Settings…', accelerator: 'CmdOrCtrl+,', click: send('settings') },
              separator,
              { role: 'services' },
              separator,
              { role: 'hide' },
              { role: 'hideOthers' },
              { role: 'unhide' },
              separator,
              { role: 'quit' },
            ],
          },
        ]
      : []),
    {
      label: 'File',
      submenu: [
        item('New Scene', 'new-scene', 'CmdOrCtrl+T'),
        item('Reopen Closed Scene', 'reopen-tab', 'Shift+CmdOrCtrl+T', { enabled: state.canReopenTab }),
        separator,
        item('Save Scene', 'sync', 'CmdOrCtrl+S'),
        item('Export STL', 'export-stl', undefined, { enabled: state.hasParts }),
        separator,
        item('Add Reference Image…', 'add-reference-image'),
        item('Import SVG…', 'import-svg'),
        item('Import Robot…', 'import-robot'),
        item('Import BVH…', 'import-bvh'),
        separator,
        // ⌘W closes the scene tab, like a browser; the window keeps ⇧⌘W
        item('Close Scene', 'close-tab', 'CmdOrCtrl+W'),
        isMac ? { role: 'close', label: 'Close Window', accelerator: 'Shift+CmdOrCtrl+W' } : { role: 'quit' },
      ],
    },
    {
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
        item('Find Parts…', 'find-parts', 'CmdOrCtrl+F'),
        ...(isMac ? [] : [separator, { label: 'Settings…', accelerator: 'Ctrl+,', click: send('settings') }]),
      ],
    },
    {
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
          label: 'Two-Finger Scroll',
          submenu: [
            item('Orbit', 'trackpad:orbit-scroll', undefined, { type: 'radio', checked: state.trackpadMode === 'orbit-scroll' }),
            item('Pan', 'trackpad:pan-scroll', undefined, { type: 'radio', checked: state.trackpadMode === 'pan-scroll' }),
          ],
        },
        separator,
        item('Show Grid', 'toggle-grid', undefined, { type: 'checkbox', checked: state.grid }),
        item('Show Reference Images', 'toggle-reference-images', 'Shift+I', { type: 'checkbox', checked: state.referenceImages }),
        separator,
        item('Show Sidebar', 'toggle-sidebar', 'CmdOrCtrl+B', { type: 'checkbox', checked: state.sidebar }),
        item('Show Inspector', 'toggle-inspector', 'CmdOrCtrl+I', { type: 'checkbox', checked: state.inspector }),
        separator,
        { role: 'togglefullscreen' },
        // Dev launches pass the project path (process.defaultApp); isPackaged reads the executable name,
        // which the dev Basecase.app renames (tools/electron-dev.mjs)
        ...(process.defaultApp ? [separator, { role: 'reload' }, { role: 'toggleDevTools' }] : []),
      ],
    },
    {
      role: 'windowMenu',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        separator,
        item('Show Previous Scene', 'prev-tab', 'Shift+CmdOrCtrl+[', { enabled: state.tabs.length > 1 }),
        item('Show Next Scene', 'next-tab', 'Shift+CmdOrCtrl+]', { enabled: state.tabs.length > 1 }),
        separator,
        // Every open scene; ⌘1–⌘9 jump to the first nine
        ...state.tabs.map((t, i) =>
          item(t.name || 'Untitled', `tab:${t.id}`, i < 9 ? `CmdOrCtrl+${i + 1}` : undefined, { type: 'checkbox', checked: t.id === state.activeTab })
        ),
        ...(isMac ? [separator, { role: 'front' }] : []),
      ],
    },
    {
      role: 'help',
      submenu: [item('Keyboard Shortcuts', 'shortcuts', '?')],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
