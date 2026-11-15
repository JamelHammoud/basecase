# src/datasets/

Datasets of tries and labelled images from any scene, versioned (`datasetFile.ts`, kept by `datasetStore/`), exported as LeRobot v3.0 for `lerobot-train`, v2.1 for GR00T, COCO and YOLO. Camera views render in workers. `import/` reads LeRobot datasets and robot recordings as tries, and coordinates image import through `src/vision/import/`. Before editing here, read:

- [Cases](../../docs/guide/cases.md) (§8h, Datasets and Imported tries)
- [Security](../../docs/guide/security.md) (§0h), for `import/`: every file there is hostile
- [Performance](../../docs/guide/performance.md) (§0f)

The rules in the root [AGENTS.md](../../AGENTS.md) apply here too. When you change how this area works, update its guide in the same change.
