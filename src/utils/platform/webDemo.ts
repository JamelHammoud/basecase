import { IS_WINDOWS } from '../os';

export const IS_WEB_DEMO = import.meta.env.MODE === 'web';

const RELEASES = 'https://github.com/JamelHammoud/basecase/releases/latest/download';

export const DESKTOP_DOWNLOAD = IS_WINDOWS
  ? { url: `${RELEASES}/Basecase-Setup.exe`, label: 'Download for Windows' }
  : { url: `${RELEASES}/Basecase.dmg`, label: 'Download for Mac' };
