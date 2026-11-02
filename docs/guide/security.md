# Security

Part of the Basecase guide. [AGENTS.md](../../AGENTS.md) holds the rules every change follows and the index of these files; section numbers (§) are shared across them.

## 0h. Security (mandatory)

The agent reads untrusted pages and files and drives an app that can spawn processes, so treat every input from the renderer, the HTTP bridge, the agent and downloaded assets as hostile. The full checklist, attack surface and accepted risks are in the `security-audit` skill; these rules hold for every change:

- **HTTP bridge:** every `/api/*` middleware is wrapped in `guardBridge` (`electron/bridgeGuard.mjs`: loopback `Host`, same-origin `Origin` and `Sec-Fetch-Site`). Vite plugin middlewares run before Vite's own host check and CORS, so nothing else protects them. A website could otherwise POST `/api/bridge/acp-connect` and run a command.
- **IPC** registers through `trustedIpc` (`electron/appOrigin.mjs`, main frame of the app origin only). Compare origins with `isAppUrl`, never `startsWith`; open only `isExternalWebUrl` links.
- **Ids that become paths** go through `checkedFileId` / `isSafeFileId` (or `safeFileId`) in `electron/backend/constants.mjs`. `library/agent.json` holds the command the app spawns.
- **Outbound fetches the agent controls** use `publicFetch` and `readCapped` (`electron/publicFetch.mjs`): public addresses only, every redirect re-checked, bodies capped. The renderer fetches agent URLs over https only.
- **Agent CLI downloads** (§0i) fetch only `https://registry.npmjs.org/` tarballs named in the build's manifest, refuse redirects, and install only when the sha512 matches the lockfile's `integrity`.
- **The CAD kernel** is forked with Node's permission model, `env: {}`, and only on Node ≥ 25 (older permission models allow network).
- **Generated HTML** escapes every value (coerce numbers); the guide viewer strips scripts, handlers, links and non-image URLs. No `dangerouslySetInnerHTML`.
- **No `shell: true`**, no string `exec` with interpolated input, no TLS verification off outside the Bambu LAN connector.
- Every security fix gets a test that feeds it the exploit input (`electron/security.test.mjs`).
