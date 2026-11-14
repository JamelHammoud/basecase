import { codePanelTokenCss } from '../../design-system/codeTokens';
import { installCodeClient } from './codeClient';

export const CODE_PANEL_CSP = [
  "default-src 'none'",
  "script-src 'unsafe-inline'",
  "style-src 'unsafe-inline'",
  'img-src data: blob:',
  'media-src data: blob:',
  'font-src data:',
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

export const CODE_PANEL_SANDBOX = 'allow-scripts';

const BASE_STYLE =
  'html,body{margin:0;height:100%;background:transparent;color:var(--bc-ink);' +
  'font:var(--bc-text)/1.4 var(--bc-font);color-scheme:dark;-webkit-font-smoothing:antialiased}';

export const codeClientScript = () => `(${installCodeClient.toString()})(window);`;

const documentHead = () =>
  '<!doctype html><meta charset="utf-8">' +
  `<meta http-equiv="Content-Security-Policy" content="${CODE_PANEL_CSP}">` +
  `<style>${codePanelTokenCss()}${BASE_STYLE}</style>` +
  `<script>${codeClientScript()}</script>`;

export const codePanelDocument = (source: string) => documentHead() + source;

export const codeSourceFirstLine = () => documentHead().split('\n').length;
