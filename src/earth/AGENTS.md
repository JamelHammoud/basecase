# src/earth/

The page's side of Place on Map: reading a pasted place, the scene's East-North-Up frame on the WGS84 ellipsoid, the tile fetch plugin that sends every request to the main process, and the fixture tiles tests use. The canvas layer is `three/viewport/earthLayer.ts`. Before editing here, read:

- [3D canvas](../../docs/guide/canvas.md) (§12, the Earth layer)
- [Security](../../docs/guide/security.md) (§0h)
- [Performance](../../docs/guide/performance.md) (§0f)

The rules in the root [AGENTS.md](../../AGENTS.md) apply here too. When you change how this area works, update its guide in the same change.
