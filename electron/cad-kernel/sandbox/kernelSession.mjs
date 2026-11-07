import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { net, session } from 'electron';
import { readLibraryFiles } from '../libraryFiles.mjs';
import {
  bundleFile,
  isKernelUrl,
  KERNEL_HTML,
  KERNEL_PARTITION,
  KERNEL_SCHEME,
  LIBRARY_PATH,
  responseHeaders,
} from './policy.mjs';

const respond = (body, pathname, status = 200) => new Response(body, { status, headers: responseHeaders(pathname) });

function serveRequest(request, { bundleDir, library }) {
  if (request.method !== 'GET' || !isKernelUrl(request.url)) return respond('Refused', '/refused.html', 403);

  const { pathname } = new URL(request.url);

  if (pathname === '/index.html') return respond(KERNEL_HTML, pathname);

  if (pathname === LIBRARY_PATH) return library().then((json) => respond(json, pathname));

  const file = bundleFile(bundleDir, request.url);

  if (!file || !fs.existsSync(file)) return respond('Not found', '/missing.html', 404);

  return net.fetch(pathToFileURL(file).href).then((response) => respond(response.body, pathname));
}

function denyEverything(ses) {
  ses.webRequest.onBeforeRequest((details, callback) => callback({ cancel: !isKernelUrl(details.url) }));
  ses.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  ses.setPermissionCheckHandler(() => false);
  ses.setDevicePermissionHandler(() => false);
  ses.setDisplayMediaRequestHandler((_request, callback) => callback({}));
  ses.on('will-download', (event) => event.preventDefault());
  ses.setSpellCheckerEnabled(false);
}

export function openKernelSession({ root, bundleDir }) {
  const ses = session.fromPartition(KERNEL_PARTITION);
  let libraryJson = null;
  const library = () => {
    libraryJson ??= readLibraryFiles(root).then((files) => JSON.stringify(files));

    return libraryJson;
  };

  denyEverything(ses);
  ses.protocol.handle(KERNEL_SCHEME, (request) => serveRequest(request, { bundleDir, library }));

  return ses;
}

export const bundleEntry = (bundleDir) => path.join(bundleDir, 'host.js');
