"""Visual meshes: triangulated in stage meters, with a colour per triangle sampled from its material."""

from dataclasses import dataclass

import numpy as np
from frames import StageFrame, gf_to_np
from looks import Look, LookReader
from pxr import Sdf, Usd, UsdGeom


@dataclass
class VisualMesh:
    prim: Usd.Prim
    points: np.ndarray
    triangles: np.ndarray
    colors: np.ndarray
    uvs: np.ndarray | None
    looks: list[Look]
    look_of: np.ndarray


@dataclass
class Topology:
    triangles: np.ndarray
    corners: np.ndarray
    faces: np.ndarray


def is_visual(prim: Usd.Prim) -> bool:
    if not prim.IsA(UsdGeom.Mesh):
        return False

    img = UsdGeom.Imageable(prim)

    if img.ComputeVisibility() == UsdGeom.Tokens.invisible:
        return False

    return img.ComputePurpose() in (UsdGeom.Tokens.default_, UsdGeom.Tokens.render)


def triangulate(counts: np.ndarray, indices: np.ndarray) -> Topology:
    counts = counts.astype(np.int64)
    starts = np.concatenate([[0], np.cumsum(counts)[:-1]])
    per_face = np.clip(counts - 2, 0, None)
    total = int(per_face.sum())
    face = np.repeat(np.arange(len(counts)), per_face)
    first = np.repeat(np.cumsum(per_face) - per_face, per_face)
    k = np.arange(total) - first + 1
    base = starts[face]
    corners = np.stack([base, base + k, base + k + 1], axis=1).reshape(-1, 3)
    return Topology(triangles=indices[corners].reshape(-1, 3), corners=corners, faces=face)


def uv_primvar(prim: Usd.Prim) -> UsdGeom.Primvar | None:
    api = UsdGeom.PrimvarsAPI(prim)
    st = api.GetPrimvar("st")

    if st and st.HasValue():
        return st

    for pv in api.GetPrimvarsWithValues():
        if pv.GetTypeName() in (Sdf.ValueTypeNames.TexCoord2fArray, Sdf.ValueTypeNames.Float2Array):
            return pv

    return None


def triangle_uvs(prim: Usd.Prim, topo: Topology) -> np.ndarray | None:
    pv = uv_primvar(prim)
    values = pv.ComputeFlattened() if pv else None

    if values is None or not len(values):
        return None

    uv = np.asarray(values, dtype=np.float64).reshape(-1, 2)
    interp = pv.GetInterpolation()
    pick = {
        UsdGeom.Tokens.faceVarying: topo.corners,
        UsdGeom.Tokens.vertex: topo.triangles,
        UsdGeom.Tokens.varying: topo.triangles,
        UsdGeom.Tokens.uniform: np.repeat(topo.faces[:, None], 3, axis=1),
    }.get(interp)

    if pick is None or pick.max(initial=0) >= len(uv):
        return None

    return uv[pick]


@dataclass
class Shading:
    colors: np.ndarray
    uvs: np.ndarray | None
    looks: list[Look]
    look_of: np.ndarray


def triangle_shading(prim: Usd.Prim, topo: Topology, looks: LookReader) -> Shading:
    """Which look (material) each triangle uses, its UVs, and its average colour."""
    uv = triangle_uvs(prim, topo)
    count = len(topo.faces)
    base: Look = looks.prim_look(prim) or looks.display_look(prim)
    used = [base]
    look_of = np.zeros(count, dtype=np.int64)
    colors = base.sample(uv, count)

    for subset in UsdGeom.Subset.GetAllGeomSubsets(UsdGeom.Imageable(prim)):
        look = looks.prim_look(subset.GetPrim())
        ids = subset.GetIndicesAttr().Get()

        if look is None or not ids:
            continue

        mask = np.isin(topo.faces, np.asarray(ids))
        look_of[mask] = len(used)
        used.append(look)
        colors[mask] = look.sample(uv[mask] if uv is not None else None, int(mask.sum()))

    return Shading(colors=np.clip(colors, 0.0, 1.0), uvs=uv, looks=used, look_of=look_of)


def read_mesh(prim: Usd.Prim, frame: StageFrame, xf: UsdGeom.XformCache, looks: LookReader) -> VisualMesh | None:
    mesh = UsdGeom.Mesh(prim)
    pts = mesh.GetPointsAttr().Get()
    counts = mesh.GetFaceVertexCountsAttr().Get()
    indices = mesh.GetFaceVertexIndicesAttr().Get()

    if not pts or not counts or not indices:
        return None

    world = gf_to_np(xf.GetLocalToWorldTransform(prim))
    topo = triangulate(np.asarray(counts), np.asarray(indices, dtype=np.int64))
    shade = triangle_shading(prim, topo, looks)
    left = mesh.GetOrientationAttr().Get() == UsdGeom.Tokens.leftHanded
    tris = topo.triangles
    uvs = shade.uvs

    if left != (np.linalg.det(world[:3, :3]) < 0):
        tris = tris[:, [0, 2, 1]]
        uvs = uvs[:, [0, 2, 1]] if uvs is not None else None

    points = frame.points(np.asarray(pts, dtype=np.float64), world)
    return VisualMesh(
        prim=prim,
        points=points,
        triangles=tris,
        colors=shade.colors,
        uvs=uvs,
        looks=shade.looks,
        look_of=shade.look_of,
    )


def mesh_volume(points: np.ndarray, tris: np.ndarray) -> float:
    a, b, c = points[tris[:, 0]], points[tris[:, 1]], points[tris[:, 2]]
    return abs(float(np.einsum("ij,ij->i", a, np.cross(b, c)).sum()) / 6)


def triangle_areas(points: np.ndarray, tris: np.ndarray) -> np.ndarray:
    a, b, c = points[tris[:, 0]], points[tris[:, 1]], points[tris[:, 2]]
    return np.linalg.norm(np.cross(b - a, c - a), axis=1) / 2


def dominant_color(colors: np.ndarray, areas: np.ndarray) -> np.ndarray:
    """The colour covering the most surface (binned so texture noise doesn't split it)."""
    bins = np.clip((colors * 15).round().astype(np.int64), 0, 15)
    keys = bins[:, 0] * 256 + bins[:, 1] * 16 + bins[:, 2]
    values, inverse = np.unique(keys, return_inverse=True)
    totals = np.bincount(inverse, weights=areas + 1e-12)
    pick = inverse == totals.argmax()
    return np.average(colors[pick], axis=0, weights=areas[pick] + 1e-12)
