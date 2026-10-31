import { IS_WINDOWS } from '../os';

export const IS_WEB_DEMO = import.meta.env.MODE === 'web';

const RELEASES = 'https://github.com/JamelHammoud/basecase/releases/latest/download';

export const WEB_APP_URL = 'https://app.basecase.so';

export const GITHUB_URL = 'https://github.com/JamelHammoud/basecase';

export const MAC_DOWNLOAD = { url: `${RELEASES}/Basecase.dmg`, label: 'Download for Mac' };

export const WINDOWS_DOWNLOAD = { url: `${RELEASES}/Basecase-Setup.exe`, label: 'Download for Windows' };

export const DESKTOP_DOWNLOAD = IS_WINDOWS ? WINDOWS_DOWNLOAD : MAC_DOWNLOAD;
