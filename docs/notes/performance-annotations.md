# Annotation projection performance

Implementation: [Annotation projection](../guide/annotations.md#performance-annotation-projection). Shared requirements: [Performance](../guide/performance.md).

## Comment attachments resolve in linear work

`annotationAttachments.test.ts` checks positions, names, replies, missing parts and edits through both pipelines, with linear ID-read budgets for 300 and 600 parts and comments. The previous export read 721,200 part IDs on the 600-item fixture. Spatial relationship inference is separate and still compares visible part pairs.
