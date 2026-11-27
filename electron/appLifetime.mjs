export function registerWindowLifetime(app, { disconnect, selfTesting, platform = process.platform }) {
  app.on('window-all-closed', () => {
    if (selfTesting) return;

    disconnect();

    if (platform !== 'darwin') app.quit();
  });
}
