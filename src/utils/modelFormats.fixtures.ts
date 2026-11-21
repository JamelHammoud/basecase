import { strToU8, zipSync } from 'three/examples/jsm/libs/fflate.module.js';

export const PLY_MODEL = `ply
format ascii 1.0
element vertex 3
property float x
property float y
property float z
element face 1
property list uchar int vertex_indices
end_header
0 0 0
10 0 0
0 10 10
3 0 1 2
`;

export const DAE_MODEL = `<?xml version="1.0" encoding="utf-8"?>
<COLLADA xmlns="http://www.collada.org/2005/11/COLLADASchema" version="1.4.1">
<asset><unit name="meter" meter="1"/><up_axis>Y_UP</up_axis></asset>
<library_geometries><geometry id="Triangle" name="Triangle"><mesh>
<source id="Points"><float_array id="PointsArray" count="9">0 0 0 0.01 0 0 0 0.01 0.02</float_array><technique_common><accessor source="#PointsArray" count="3" stride="3"><param name="X" type="float"/><param name="Y" type="float"/><param name="Z" type="float"/></accessor></technique_common></source>
<vertices id="Vertices"><input semantic="POSITION" source="#Points"/></vertices>
<triangles count="1"><input semantic="VERTEX" source="#Vertices" offset="0"/><p>0 1 2</p></triangles>
</mesh></geometry></library_geometries>
<library_visual_scenes><visual_scene id="Scene"><node id="TriangleNode" name="Triangle"><instance_geometry url="#Triangle"/></node></visual_scene></library_visual_scenes>
<scene><instance_visual_scene url="#Scene"/></scene>
</COLLADA>`;

export function threeMfModel(): Uint8Array {
  return zipSync({
    '_rels/.rels': strToU8(
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/model.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>',
    ),
    '3D/model.model': strToU8(
      '<model unit="millimeter" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02"><resources><object id="1" type="model" name="Triangle"><mesh><vertices><vertex x="0" y="0" z="0"/><vertex x="10" y="0" z="0"/><vertex x="0" y="10" z="10"/></vertices><triangles><triangle v1="0" v2="1" v3="2"/></triangles></mesh></object></resources><build><item objectid="1"/></build></model>',
    ),
  });
}
