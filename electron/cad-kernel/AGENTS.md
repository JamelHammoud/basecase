# electron/cad-kernel/

The sandboxed OpenSCAD / replicad kernel: pure kernel logic here, the app's Chromium sandbox host in `sandbox/` (which also runs the CAD file converter from `../cadImport/`), the test-only Node host in `nodeHost/`, and the MCP server's bridge client in `client.mjs`. Before editing here, read:

- [Agent](../../docs/guide/agent.md) (§9)
- [Security](../../docs/guide/security.md) (§0h)
- [Windows](../../docs/guide/windows.md) (§0j)

The rules in the root [AGENTS.md](../../AGENTS.md) apply here too. When you change how this area works, update its guide in the same change.
