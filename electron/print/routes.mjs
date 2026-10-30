const withBytes = (payload) => ({
  ...payload,
  groups: (payload.groups ?? []).map((g) => ({
    ...g,
    bytes: typeof g.bytes === 'string' ? Buffer.from(g.bytes, 'base64') : g.bytes,
  })),
});

export const PRINT_CALLS = {
  'print:status': (p) => p.status(),
  'print:printers': (p) => p.listPrinters(),
  'print:save-printers': (p, list) => p.savePrinters(list),
  'print:set-secret': (p, payload) => p.setPrinterSecret(payload),
  'print:discover': (p) => p.discover(),
  'print:test': (p, id) => p.testPrinter(id),
  'print:printer-status': (p, id) => p.printerStatus(id),
  'print:control': (p, payload) => p.controlPrinter(payload),
  'print:open': (p, payload) => p.open(withBytes(payload)),
  'print:slice': (p, payload) => p.slice(withBytes(payload)),
  'print:last-slice': (p, jobId) => p.lastSlice(jobId),
  'print:stop-slice': (p, jobId) => p.stopSlice(jobId),
  'print:send': (p, payload) => p.send(payload),
  'print:reveal': (p, jobId) => p.reveal(jobId),
  'print:open-link': (p, url) => p.openLink(url),
};

export function registerPrintHandlers(ipcMain, printing) {
  for (const [channel, call] of Object.entries(PRINT_CALLS))
    ipcMain.handle(channel, (_e, payload) => call(printing, payload));
}

export const printPostRoutes = (printing) =>
  Object.entries(PRINT_CALLS).map(([channel, call]) => [
    `/${channel.replace(':', '-')}`,
    (body) => call(printing, body?.arg),
  ]);
