# src/vision/

Labelled images from Cases and imported datasets, frame labels, COCO and YOLO packages, ONNX manifests, the model cache and inference workers. `import/` reads COCO, YOLO, Pascal VOC and Hub image Parquet in the import worker. Before editing here, read:

- [Cases](../../docs/guide/cases.md) (§8h, Training images and Datasets)
- [Cameras](../../docs/guide/cameras.md) (§8l, label passes and inference)
- [Routines](../../docs/guide/routines.md) (§8j)
- [Performance](../../docs/guide/performance.md) (§0f)
- [Security](../../docs/guide/security.md) (§0h), for model assets, stored image files and imported package validation

The root [AGENTS.md](../../AGENTS.md) applies here too. Update the area's guide when its behavior changes.
