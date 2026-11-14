export const MENU_PATH_ARROW = /\p{Lu}[\p{L}\d]+\**(?:\s*(?:→|›|->)\s*|\s>\s)\**\p{Lu}[\p{L}\d]+/u;

export const MENU_PATH_FIX = 'Join a menu path’s labels with ▸: “Settings ▸ Accounts”, not “Settings → Accounts”.';

export const arrowPathIn = (text) => MENU_PATH_ARROW.exec(text)?.[0] ?? null;
