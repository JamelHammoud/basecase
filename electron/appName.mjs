export const DEV_MODE = Boolean(process.defaultApp) && !process.argv.includes('--bundle');
export const APP_DISPLAY_NAME = DEV_MODE ? 'Basecase (Dev)' : 'Basecase';
