"""
Basecase SimReady converter: one SimReady OpenUSD asset in, one Basecase model out.

electron/simready.mjs downloads the asset's files and runs this script through uv. It writes
model.json (bodies, joints, masses, friction, in meters with Z up) and one GLB per body in
meshes/, which the app imports like a URDF or MJCF robot (src/utils/robotImport/simready.ts).
Progress goes to stdout as one JSON object per line.

The MuJoCo physics variant is selected when the asset has one, so masses, colliders and
actuator limits are the ones MuJoCo was validated with.
"""

import argparse
import json
import os
import sys
from dataclasses import dataclass

import numpy as np
from frames import StageFrame, column_major, to_local
from glb import GlbBuilder, Group
from looks import LookReader
from meshes import VisualMesh, dominant_color, is_visual, mesh_volume, read_mesh, triangle_areas
from physics import Body, Physics, owning_body, read_physics
from pxr import Usd, UsdGeom

FORMAT = "basecase-simready"
VERSION = 3
MAX_TRIANGLES = 1_500_000


def emit(**kw):
    print(json.dumps(kw), flush=True)


def select_mujoco(prim: Usd.Prim) -> None:
    sets = prim.GetVariantSets()

    for name in sets.GetNames():
        vset = sets.GetVariantSet(name)
        names = vset.GetVariantNames()
        lower = {n.lower(): n for n in names}

        if name.lower() == "mujoco" and "enabled" in lower:
            vset.SetVariantSelection(lower["enabled"])
        elif name.lower() in ("physx", "newton") and "disabled" in lower and "MuJoCo" in sets.GetNames():
            vset.SetVariantSelection(lower["disabled"])
        elif "mujoco" in lower:
            vset.SetVariantSelection(lower["mujoco"])


def open_stage(path: str) -> Usd.Stage:
    stage = Usd.Stage.Open(path)
    root = stage.GetDefaultPrim() or next(iter(stage.GetPseudoRoot().GetChildren()), None)

    if root is None:
        raise ValueError("The asset has no root prim.")

    select_mujoco(root)
    return stage


def collect_meshes(stage: Usd.Stage, frame: StageFrame) -> list[VisualMesh]:
    xf = UsdGeom.XformCache()
    looks = LookReader()
    out: list[VisualMesh] = []
    total = 0

    for prim in stage.Traverse(Usd.TraverseInstanceProxies(Usd.PrimDefaultPredicate)):
        if not is_visual(prim):
            continue

        mesh = read_mesh(prim, frame, xf, looks)

        if mesh is None or not len(mesh.triangles):
            continue

        total += len(mesh.triangles)

        if total > MAX_TRIANGLES:
            raise ValueError("The asset has more than 1.5 million triangles. Choose a smaller one.")

        out.append(mesh)

    return out


def base_body() -> Body:
    return Body(prim=None, name="base", world=np.eye(4), frame=np.eye(4))


def group_meshes(meshes: list[VisualMesh], phys: Physics) -> dict[str, list[VisualMesh]]:
    by_body: dict[str, list[VisualMesh]] = {}
    root = phys.bodies.get(next((k for k, b in phys.bodies.items() if b.name == phys.root), ""), None)

    for mesh in meshes:
        body = owning_body(str(mesh.prim.GetPath()), phys.bodies) or root

        if body is None:
            body = base_body()
            phys.bodies.setdefault("/", body)
            phys.root = body.name

        by_body.setdefault(body.name, []).append(mesh)

    return by_body


def hex_color(c: np.ndarray) -> str:
    return "#{:02x}{:02x}{:02x}".format(*(max(0, min(255, round(float(v) * 255))) for v in c))


@dataclass
class BodyMeshes:
    body: Body
    meshes: list[VisualMesh]
    local: list[np.ndarray]

    @property
    def offsets(self) -> np.ndarray:
        return np.cumsum([0] + [len(p) for p in self.local])

    @property
    def points(self) -> np.ndarray:
        return np.concatenate(self.local)

    @property
    def triangles(self) -> np.ndarray:
        return np.concatenate([m.triangles + o for m, o in zip(self.meshes, self.offsets, strict=False)])


def add_visual(builder: GlbBuilder, bm: BodyMeshes) -> None:
    """The body's node in visual.glb: a primitive per look (material) across its meshes."""
    mesh = builder.node(bm.body.name)
    pts = bm.points

    for look_id, look in {id(lk): lk for m in bm.meshes for lk in m.looks}.items():
        corners, uvs = [], []

        for m, offset in zip(bm.meshes, bm.offsets, strict=False):
            pick = np.array([id(lk) for lk in m.looks], dtype=np.int64)[m.look_of] == look_id

            if pick.any():
                corners.append(m.triangles[pick] + offset)
                uvs.append(m.uvs[pick] if m.uvs is not None else np.zeros((int(pick.sum()), 3, 2)))

        if corners:
            builder.primitive(mesh, Group(pts, np.concatenate(corners), np.concatenate(uvs), look))


def write_body_mesh(bm: BodyMeshes, out_dir: str, index: int) -> dict:
    pts, idx = bm.points, bm.triangles
    colors = np.concatenate([m.colors for m in bm.meshes])
    rel = f"meshes/{index}.glb"
    shape = GlbBuilder()
    shape.shape(shape.node(bm.body.name), pts, idx)
    shape.write(os.path.join(out_dir, rel))
    main = dominant_color(colors, triangle_areas(pts, idx))
    return {"mesh": rel, "color": hex_color(main), "triangles": len(idx), "volume": mesh_volume(pts, idx)}


def body_record(body: Body, bm: BodyMeshes | None, out_dir: str, index: int) -> dict:
    record = {"name": body.name, "world": column_major(body.frame), "mesh": None, "color": None}

    if bm:
        written = write_body_mesh(bm, out_dir, index)
        volume = written.pop("volume")
        record.update(written)

        if body.mass is None and body.density:
            body.mass = body.density * volume

    if body.mass:
        record["mass"] = round(body.mass, 6)

    if body.com is not None:
        record["com"] = [round(float(v), 6) for v in body.com]

    return record


def joint_record(j) -> dict:
    return {
        "name": j.name,
        "type": j.type,
        "parent": j.parent,
        "child": j.child,
        "world": column_major(j.frame),
        "axis": list(j.axis),
        "limit": [round(v, 6) for v in j.limit] if j.limit else None,
        "effort": j.effort,
        "velocity": j.velocity,
    }


def convert(root_usd: str, out_dir: str) -> dict:
    emit(type="status", message="Reading the asset")
    stage = open_stage(root_usd)
    frame = StageFrame.of(stage)
    phys = read_physics(stage, frame, UsdGeom.XformCache())
    emit(type="status", message="Reading meshes")
    meshes = collect_meshes(stage, frame)

    if not meshes:
        raise ValueError("The asset has no visible meshes.")

    os.makedirs(os.path.join(out_dir, "meshes"), exist_ok=True)
    by_body = group_meshes(meshes, phys)
    bodies = {
        b.name: BodyMeshes(b, by_body[b.name], [to_local(b.frame, m.points) for m in by_body[b.name]])
        for b in phys.bodies.values()
        if b.name in by_body
    }
    links = [body_record(b, bodies.get(b.name), out_dir, i) for i, b in enumerate(phys.bodies.values())]
    emit(type="status", message="Packing textures")
    visual = GlbBuilder()

    for bm in bodies.values():
        add_visual(visual, bm)

    visual.write(os.path.join(out_dir, "visual.glb"))
    model = {
        "format": FORMAT,
        "version": VERSION,
        "name": stage.GetDefaultPrim().GetName() if stage.GetDefaultPrim() else "asset",
        "root": phys.root,
        "links": links,
        "joints": [joint_record(j) for j in phys.joints],
        "friction": phys.friction,
        "visual": "visual.glb",
        "notes": phys.notes,
    }

    with open(os.path.join(out_dir, "model.json"), "w") as f:
        json.dump(model, f, separators=(",", ":"))

    return model


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", required=True)
    parser.add_argument("--out", required=True)
    args = parser.parse_args()

    try:
        model = convert(args.root, args.out)
    except Exception as e:
        emit(type="error", message=str(e) or e.__class__.__name__)
        sys.exit(1)

    emit(type="done", links=len(model["links"]), joints=len(model["joints"]))


if __name__ == "__main__":
    main()
