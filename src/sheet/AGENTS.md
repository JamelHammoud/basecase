# src/sheet/

Parts cut from sheet: the materials and stock thicknesses, the flat-part detector the analysis worker runs, and the DXF cut files. Before editing here, read:

- [Build](../../docs/guide/build.md) (§8b, Sheet parts)
- [Performance](../../docs/guide/performance.md) (§0f): detection runs in the analysis worker, never on the main thread
- [Security](../../docs/guide/security.md) (§0h): cut file names come from part names

The rules in the root [AGENTS.md](../../AGENTS.md) apply here too. When you change how this area works, update its guide in the same change.
