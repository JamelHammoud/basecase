# Integrations

Imports, exports and services Basecase connects to, and how far each goes. Entry format and rules: [README](README.md).

## CAD import

### Onshape

- **Link:** https://onshape-public.github.io/docs/api-adv/translation/
- **Checked:** 2026-11-15
- **Basecase today:** Import Robot reads a desktop assembly link using the account's API keys, converts distinct STEP parts, fuses fastened parts and creates revolute and slider joints with limits. Unsupported mates and cylindrical slides are reported as Fixed Mates ([Joints and motion](../guide/joints-and-motion.md), [assembly reader](../../electron/onshape/assembly.mjs)). Update from Onshape preserves matched part and joint identities, servo assignments and user-added parts ([Joints and motion](../guide/joints-and-motion.md)).
- **Better than Basecase:** native export takes URDF with GLTF meshes through the assembly translations endpoint and accepts a configuration in the payload ([employee's example](https://forum.onshape.com/discussion/30410/improvements-to-onshape-march-13-2026)). Release 1.215 adds frames, tool center points and adjustable mesh tessellation ([release](https://www.onshape.com/en/resource-center/what-is-new/mate-connectors-explicit-lights-render-studio-advanced-urdf-mate-limit-support-robotics-applications)). The separate onshape-to-robot exporter maps named degree-of-freedom connectors, frames and loop closures ([design rules](https://onshape-to-robot.readthedocs.io/en/latest/design.html)).
- **Worse than Basecase:** Onshape's translation guide requires authentication and does not list URDF in the fetched page ([API guide](https://onshape-public.github.io/docs/api-adv/translation/)). onshape-to-robot requires its connector naming conventions ([design rules](https://onshape-to-robot.readthedocs.io/en/latest/design.html)), while Basecase reads ordinary mates and can update them in place ([Joints and motion](../guide/joints-and-motion.md)).
- **Basecase should:** integrate native frames and tool center points only after comparing an export with the existing mate reader on the same configured assembly ([account investigation](accounts.md)). Keep the existing identity-preserving update path in that comparison ([Joints and motion](../guide/joints-and-motion.md)).

### Fusion

- **Link:** https://github.com/syuntoku14/fusion2urdf
- **Checked:** 2026-11-15
- **Basecase today:** STEP imports as one part per body without joints ([Inspector](../guide/inspector-and-selection.md)). Import Robot expands xacro packages before reading URDF joints, preserving revolute and prismatic axes and limits ([xacro reader](../../src/utils/robotImport/xacro.ts), [URDF reader](../../src/utils/robotImport/urdf.ts), [Joints and motion](../guide/joints-and-motion.md)).
- **Better than Basecase:** fusion2urdf's README describes a ROS description package with STL meshes, launch files and Rigid, Slider and Revolute joints, including slider and revolute limits. It also describes Python 3.12 compatibility changes above the older dated update list ([repository](https://github.com/syuntoku14/fusion2urdf)).
- **Worse than Basecase:** the README says nested components are unsupported and warns that incorrect joint definitions can produce abnormal output without an error. Its update list says the output changed to xacro ([repository](https://github.com/syuntoku14/fusion2urdf)). Basecase can read that package, then generate MuJoCo directly from the imported scene ([Joints and motion](../guide/joints-and-motion.md), [Simulate](../guide/simulate.md)).
- **Basecase should:** integrate through the existing package reader, checking a representative export in the [account investigation](accounts.md). The dated README list alone does not establish that the exporter is unmaintained, especially while the same page describes compatibility changes ([repository](https://github.com/syuntoku14/fusion2urdf)).

## Dataset export

### LeRobot

- **Link:** https://huggingface.co/docs/lerobot/lerobot-dataset-v3
- **Checked:** 2026-11-15
- **Basecase today:** Export Dataset writes LeRobot v3.0 at the root and a v2.1 copy with GR00T metadata in its compatibility folder ([writer](../../src/datasets/lerobotExport.ts)). Publish to Hugging Face publishes both format revisions and tags them, with v3 on main ([publisher](../../electron/hub/publishRepo.mjs)). Import reads v2.0, v2.1 and v3.0 from folders, zips and Hub links as tries ([Cases](../guide/cases.md#imported-tries)).
- **Better than Basecase:** LeRobot also reads a LanceDB backend with unchanged metadata and frames and videos in tables, selected by storage_format in info.json. Its dataset viewer supports Rerun and Foxglove ([v3 docs](https://huggingface.co/docs/lerobot/lerobot-dataset-v3)).
- **Worse than Basecase:** the Lance reader needs the lancedb extra and video-backed camera features, and is read-only. Recording and editing still use the default format before conversion ([v3 docs](https://huggingface.co/docs/lerobot/lerobot-dataset-v3#other-formats-and-implementations)). Basecase already writes the default v3 format directly, so its exports do not need the documented v2.1-to-v3 conversion ([writer](../../src/datasets/lerobotV3.ts), [migration](https://huggingface.co/docs/lerobot/lerobot-dataset-v3#migrate-v21--v30)).
- **Basecase should:** integrate playback using the existing v3 output and LeRobot viewer, whose Foxglove mode serves episodes over WebSocket ([viewer](https://huggingface.co/docs/lerobot/lerobot-dataset-v3#other-formats-and-implementations)). Preserve the current writer for recording and export rather than replacing it with a read-only backend ([writer](../../src/datasets/lerobotExport.ts)).

## Image datasets

### Roboflow

- **Link:** https://docs.roboflow.com/datasets/versions/dataset-versions/exporting-data
- **Checked:** 2026-11-14
- **Basecase today:** Import Robot accepts Roboflow project and dataset version links on desktop, using the API key saved in Settings ▸ Accounts. It downloads a COCO export and stores the images, classes, annotations and source splits as a dataset. Import also reads local COCO, YOLO and Pascal VOC folders and zips ([Cases](../guide/cases.md#imported-image-datasets), [help](../../site/content/help/import-an-image-dataset.md)). Train freezes that dataset for local vision training and compares the result with its incumbent on the same held-out real images ([Vision training](../guide/cases.md#vision-training), [help](../../site/content/help/train-a-vision-model.md)).
- **Better than Basecase:** Roboflow exports a chosen dataset version in many annotation formats through the web app, Python SDK, REST API and CLI. Its source-image export preserves original image bytes, while training-version exports compress images ([dataset exports](https://docs.roboflow.com/datasets/versions/dataset-versions/exporting-data)).
- **Worse than Basecase:** Roboflow's export is a snapshot built for training ([export behavior](https://docs.roboflow.com/datasets/versions/dataset-versions/exporting-data#export-behavior)). Basecase can combine those imported frames with labeled images generated from a Case, then export COCO and YOLO together or publish them to Hugging Face under a frozen dataset version ([Cases](../guide/cases.md#datasets)).
- **Basecase should:** keep the source version and split assignments when importing, and let the same versioned dataset hold real images and generated Case views, as the current image-member format does ([Cases](../guide/cases.md#imported-image-datasets)).

## Supplier carts

### DigiKey

- **Link:** https://developer.digikey.com/products/mylists/mylists
- **Checked:** 2026-11-15
- **Basecase today:** Buy All builds an Amazon cart with pack quantities after subtracting on-hand stock. Other suppliers are grouped product links, without a list API connector ([Build](../guide/build.md), [cart](../../src/components/build/cart.ts)).
- **Better than Basecase:** MyLists exposes CreateList and AddPartsToListId ([API index](https://developer.digikey.com/products/mylists/mylists)). The downloadable schema includes requested part number, manufacturer, customer reference and requested quantities with packaging fields ([schema](https://developer.digikey.com/node/2690/oas-download)).
- **Worse than Basecase:** MyLists requires three-legged OAuth ([authentication](https://developer.digikey.com/products/mylists/mylists/addpartstolistid)), whereas Basecase's current cart needs no connected account ([Build](../guide/build.md)). The portal's endpoint index and changelog disagree about some retired operations, so the index alone is not a current contract ([index](https://developer.digikey.com/products/mylists/mylists), [changelog](https://developer.digikey.com/changelog)).
- **Basecase should:** integrate a user-requested DigiKey list handoff for supplier-matched BOM lines, preserving exact part numbers, the units left to buy and each line's reference ([cart](../../src/components/build/cart.ts), [schema](https://developer.digikey.com/node/2690/oas-download)). Use CreateList and AddPartsToListId with the documented account-header change, and validate the response in the developer sandbox before offering a completed list link ([changelog](https://developer.digikey.com/changelog), [sandbox setup](https://developer.digikey.com/)).

### To check

- Mouser
- Pololu
- Adafruit
- Amazon

## Printing

Sending to Bambu (Studio, Connect and LAN), Moonraker, PrusaLink and OctoPrint printers ships today ([Printing](../guide/printing.md)).

### Prusa Connect

- **Link:** https://help.prusa3d.com/article/prusa-connect-and-prusalink-explained_302608
- **Checked:** 2026-11-15
- **Basecase today:** uploads sliced G-code to local PrusaLink with an API key, reads status and pauses, resumes and cancels jobs ([connector](../../electron/print/connectors/prusalink.mjs), [Printing](../guide/printing.md)). The connection types include PrusaLink but no Prusa Connect connector ([types](../../src/data/printers.ts)).
- **Better than Basecase:** Connect manages printers through a cloud service, with 1 GB of G-code and telemetry storage free for Prusa owners, while PrusaLink is local-network only ([comparison](https://help.prusa3d.com/article/prusa-connect-and-prusalink-explained_302608)). Prusa documents choosing the PrusaConnect host in PrusaSlicer and supplying a printer's Connect API key ([upload setup](https://help.prusa3d.com/article/sending-g-codes-to-printer-via-network-prusa-connect-prusalink-octoprint_196761)).
- **Worse than Basecase:** that upload setup is under PrusaSlicer 2.9 Legacy, and does not specify a third-party HTTP upload contract ([setup](https://help.prusa3d.com/article/sending-g-codes-to-printer-via-network-prusa-connect-prusalink-octoprint_196761)). The published 2.9.0 PrusaConnectNew implementation uses an OAuth bearer token and team-scoped registration and upload, a different credential flow ([source](https://raw.githubusercontent.com/prusa3d/PrusaSlicer/version_2.9.0/src/slic3r/Utils/PrusaConnect.cpp)). Basecase's local path already works through its separate PrusaLink connector ([connector](../../electron/print/connectors/prusalink.mjs)).
- **Basecase should:** integrate cloud uploads after testing which published authentication flow a new Connect account supports, with that specific comparison in the [account entry](accounts.md). Do not treat Connect as the existing PrusaLink connector at a different hostname because their documented and implemented flows differ ([setup](https://help.prusa3d.com/article/sending-g-codes-to-printer-via-network-prusa-connect-prusalink-octoprint_196761), [source](https://raw.githubusercontent.com/prusa3d/PrusaSlicer/version_2.9.0/src/slic3r/Utils/PrusaConnect.cpp)).

### To check

- Bambu Lab
