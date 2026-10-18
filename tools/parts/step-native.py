"""
Native OpenCascade STEP/IGES reader for files too large (or IGES trims too hard) for the WebAssembly readers
(convert-step.mjs uses it when a source sets "reader": "native").

    python step-native.py <in.step> <out.bin> <linear deflection mm> <angular deflection rad>

Needs the cadquery-ocp package (OCP). Writes colored triangles in the CAD frame (mm):
    uint32 group count, then per group: float32 r, g, b (sRGB 0-1), uint32 float count, float32 xyz…
"""

import struct
import sys

from OCP.BRepMesh import BRepMesh_IncrementalMesh
from OCP.IFSelect import IFSelect_RetDone
from OCP.IGESCAFControl import IGESCAFControl_Reader
from OCP.Quantity import Quantity_TOC_sRGB
from OCP.RWMesh import RWMesh_FaceIterator
from OCP.STEPCAFControl import STEPCAFControl_Reader
from OCP.TCollection import TCollection_ExtendedString
from OCP.TDocStd import TDocStd_Document
from OCP.XCAFPrs import XCAFPrs_DocumentExplorer, XCAFPrs_DocumentExplorerFlags_OnlyLeafNodes

src, out, lin, ang = sys.argv[1], sys.argv[2], float(sys.argv[3]), float(sys.argv[4])

doc = TDocStd_Document(TCollection_ExtendedString("doc"))
iges = src.lower().endswith((".igs", ".iges"))
reader = IGESCAFControl_Reader() if iges else STEPCAFControl_Reader()
reader.SetColorMode(True)
reader.SetNameMode(True)
if reader.ReadFile(src) != IFSelect_RetDone or not reader.Transfer(doc):
    sys.exit("OpenCascade could not read " + src)

# Triangulate the whole model once; document labels share these faces
BRepMesh_IncrementalMesh(reader.OneShape() if iges else reader.Reader().OneShape(), lin, False, ang, True)

groups = {}
explorer = XCAFPrs_DocumentExplorer(doc, XCAFPrs_DocumentExplorerFlags_OnlyLeafNodes)
while explorer.More():
    node = explorer.Current()
    faces = RWMesh_FaceIterator(node.RefLabel, node.Location, True, node.Style)
    while faces.More():
        if faces.NbTriangles() > 0:
            rgb = (0.6, 0.6, 0.62)
            if faces.HasFaceColor():
                c = faces.FaceColor().GetRGB()
                r, g, b = c.Values(Quantity_TOC_sRGB)
                rgb = (r, g, b)
            key = tuple(round(v * 255) for v in rgb)
            soup = groups.setdefault(key, (rgb, []))[1]
            for t in range(faces.ElemLower(), faces.ElemUpper() + 1):
                tri = faces.TriangleOriented(t)  # already flipped for reversed faces
                ids = [tri.Value(1), tri.Value(2), tri.Value(3)]
                for n in ids:
                    p = faces.NodeTransformed(n)
                    soup.extend((p.X(), p.Y(), p.Z()))
        faces.Next()
    explorer.Next()

with open(out, "wb") as f:
    f.write(struct.pack("<I", len(groups)))
    for rgb, soup in groups.values():
        f.write(struct.pack("<3fI", *rgb, len(soup)))
        f.write(struct.pack(f"<{len(soup)}f", *soup))
print(len(groups), "colors", sum(len(s) for _, s in groups.values()) // 9, "triangles")
