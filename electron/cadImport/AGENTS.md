# electron/cadImport/

Maker CAD files the agent downloads: the link check, the download, and the converter that runs inside the CAD kernel's Chromium sandbox (`convertWorker.mjs`), plus the STEP, GLB and meshopt code the parts pipeline shares. The test-only Node host is in `nodeHost/`. Before editing here, read:

- [Security](../../docs/guide/security.md) (§0h)
- [Parts catalog](../../docs/guide/parts-catalog.md) (§8a)
- [Windows](../../docs/guide/windows.md) (§0j)

The rules in the root [AGENTS.md](../../AGENTS.md) apply here too. When you change how this area works, update its guide in the same change.
