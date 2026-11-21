import { codePanelTokenCss } from '../../design-system/codeTokens';
import { sha256Hex } from '../../skills/hash';
import { forwardConsole, installCodeClient } from './codeClient';

export const CODE_PANEL_CSP = [
  "default-src 'none'",
  "webrtc 'block'",
  "script-src 'none'",
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

export const codeClientScript = () =>
  `${lockWebrtc}(${installCodeClient.toString()})(window, ${forwardConsole.toString()});`;

const lockWebrtc =
  "for(const name of ['RTCPeerConnection','webkitRTCPeerConnection'])Object.defineProperty(window,name,{value:undefined,writable:false,configurable:false});";

const scriptHash = (script: string) => {
  const bytes = sha256Hex(script)
    .match(/../g)!
    .map((byte) => Number.parseInt(byte, 16));

  return `'sha256-${btoa(String.fromCharCode(...bytes))}'`;
};

const isExecutableScript = (open: string) => {
  const attributes = [...open.matchAll(/\s+([^\s=/>]+)(?:\s*=\s*("[^"]*"|'[^']*'|[^\s>]+))?/g)];
  const value = attributes.find((attribute) => attribute[1].toLowerCase() === 'type')?.[2] ?? '';
  const type = value
    .replace(/^(["'])([\s\S]*)\1$/, '$2')
    .trim()
    .toLowerCase();

  return (
    !type ||
    type === 'module' ||
    /^(?:(?:application|text)\/(?:x-)?(?:java|ecma)script|text\/(?:javascript1\.[0-5]|jscript|livescript))$/.test(type)
  );
};

const documentHead = (policy = CODE_PANEL_CSP) =>
  '<!doctype html><meta charset="utf-8">' +
  `<meta http-equiv="Content-Security-Policy" content="${policy}">` +
  '<meta http-equiv="Content-Security-Policy" content="script-src \'unsafe-inline\'">' +
  `<style>${codePanelTokenCss()}${BASE_STYLE}</style>` +
  `<script>${codeClientScript()}</script>`;

export function codePanelDocument(source: string) {
  const hashes = new Set([scriptHash(codeClientScript())]);
  const protectedSource = source
    .replace(/\r\n?/g, '\n')
    .replace(/\0/g, '\ufffd')
    .replace(
      /(<script\b(?:[^>"']|"[^"]*"|'[^']*')*>)([\s\S]*?)(<\/script\s*>)/gi,
      (_match, open: string, script: string, close: string) => {
        if (!isExecutableScript(open)) return open + script + close;

        const protectedScript = lockWebrtc + script;

        hashes.add(scriptHash(protectedScript));

        return open + protectedScript + close;
      },
    );
  const policy = CODE_PANEL_CSP.replace("script-src 'none'", `script-src ${[...hashes].join(' ')}`);

  return documentHead(policy) + protectedSource;
}

export const codeSourceFirstLine = () => documentHead().split('\n').length;
