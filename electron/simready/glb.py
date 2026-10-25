"""Writes binary glTF (GLB): named nodes, a primitive per material, UVs and JPEG albedo textures (each once)."""

import io
import json
import struct
from dataclasses import dataclass

import numpy as np
from looks import Look
from PIL import Image

FLOAT = 5126
UINT = 5125
ARRAY_BUFFER = 34962
ELEMENT_ARRAY_BUFFER = 34963
REPEAT = 10497
TEXTURE_SIDE = 1024
UV_STEP = 1e5


def srgb_to_linear(c: np.ndarray) -> np.ndarray:
    c = np.clip(c, 0.0, 1.0)
    return np.where(c <= 0.04045, c / 12.92, np.power((c + 0.055) / 1.055, 2.4))


def jpeg(path: str) -> bytes | None:
    try:
        with Image.open(path) as img:
            rgb = img.convert("RGB")
            rgb.thumbnail((TEXTURE_SIDE, TEXTURE_SIDE))
            out = io.BytesIO()
            rgb.save(out, format="JPEG", quality=85)
            return out.getvalue()
    except (OSError, ValueError):
        return None


@dataclass
class Group:
    """Triangles of one look: corners are (k, 3) point indices, uvs (k, 3, 2) per corner or None."""

    points: np.ndarray
    corners: np.ndarray
    uvs: np.ndarray | None
    look: Look


class GlbBuilder:
    def __init__(self) -> None:
        self.data = bytearray()
        self.gltf: dict = {
            "asset": {"version": "2.0", "generator": "basecase-simready"},
            "scene": 0,
            "scenes": [{"nodes": []}],
            "nodes": [],
            "meshes": [],
            "buffers": [{"byteLength": 0}],
            "bufferViews": [],
            "accessors": [],
            "materials": [],
            "samplers": [{"wrapS": REPEAT, "wrapT": REPEAT}],
            "textures": [],
            "images": [],
        }
        self.material_of: dict[int, int] = {}
        self.texture_of: dict[str, int | None] = {}

    def view(self, raw: bytes, target: int | None = None) -> int:
        self.data.extend(b"\0" * ((4 - len(self.data) % 4) % 4))
        entry = {"buffer": 0, "byteOffset": len(self.data), "byteLength": len(raw)}

        if target:
            entry["target"] = target

        self.data.extend(raw)
        self.gltf["bufferViews"].append(entry)
        return len(self.gltf["bufferViews"]) - 1

    def accessor(self, arr: np.ndarray, kind: str, target: int) -> int:
        comp = UINT if arr.dtype == np.uint32 else FLOAT
        entry = {
            "bufferView": self.view(np.ascontiguousarray(arr).tobytes(), target),
            "componentType": comp,
            "count": len(arr),
            "type": kind,
        }

        if kind == "VEC3":
            entry.update(min=arr.min(axis=0).tolist(), max=arr.max(axis=0).tolist())

        self.gltf["accessors"].append(entry)
        return len(self.gltf["accessors"]) - 1

    def texture(self, path: str) -> int | None:
        if path not in self.texture_of:
            raw = jpeg(path)
            index = None

            if raw:
                self.gltf["images"].append({"bufferView": self.view(raw), "mimeType": "image/jpeg"})
                self.gltf["textures"].append({"sampler": 0, "source": len(self.gltf["images"]) - 1})
                index = len(self.gltf["textures"]) - 1

            self.texture_of[path] = index

        return self.texture_of[path]

    def material(self, look: Look) -> tuple[int, bool]:
        texture = self.texture(look.path) if look.path else None
        key = id(look)

        if key not in self.material_of:
            pbr = {
                "baseColorFactor": [*srgb_to_linear(np.asarray(look.color, dtype=np.float64)).tolist(), 1.0],
                "metallicFactor": 0.0,
                "roughnessFactor": 0.6,
            }

            if texture is not None:
                pbr["baseColorTexture"] = {"index": texture}

            self.gltf["materials"].append({"pbrMetallicRoughness": pbr})
            self.material_of[key] = len(self.gltf["materials"]) - 1

        return self.material_of[key], texture is not None

    def node(self, name: str) -> int:
        self.gltf["meshes"].append({"primitives": []})
        self.gltf["nodes"].append({"name": name, "mesh": len(self.gltf["meshes"]) - 1})
        self.gltf["scenes"][0]["nodes"].append(len(self.gltf["nodes"]) - 1)
        return len(self.gltf["meshes"]) - 1

    def shape(self, mesh: int, points: np.ndarray, corners: np.ndarray) -> None:
        """Geometry only: positions and indices, no material."""
        unique, inverse = np.unique(corners.reshape(-1), return_inverse=True)
        attributes = {"POSITION": self.accessor(points[unique].astype(np.float32), "VEC3", ARRAY_BUFFER)}
        indices = self.accessor(inverse.reshape(-1).astype(np.uint32), "SCALAR", ELEMENT_ARRAY_BUFFER)
        self.gltf["meshes"][mesh]["primitives"].append({"attributes": attributes, "indices": indices})

    def primitive(self, mesh: int, group: Group) -> None:
        """UVs are kept only when the look has a texture."""
        points, uvs = group.points, group.uvs
        material, textured = self.material(group.look)
        flat = group.corners.reshape(-1)

        if textured and uvs is not None:
            q = np.round(uvs.reshape(-1, 2) * UV_STEP).astype(np.int64)
            keys = np.stack([flat, q[:, 0], q[:, 1]], axis=1)
            unique, inverse = np.unique(keys, axis=0, return_inverse=True)
            uv = unique[:, 1:] / UV_STEP
            attributes = {
                "POSITION": self.accessor(points[unique[:, 0]].astype(np.float32), "VEC3", ARRAY_BUFFER),
                "TEXCOORD_0": self.accessor(
                    np.stack([uv[:, 0], 1 - uv[:, 1]], axis=1).astype(np.float32), "VEC2", ARRAY_BUFFER
                ),
            }
        else:
            unique, inverse = np.unique(flat, return_inverse=True)
            attributes = {"POSITION": self.accessor(points[unique].astype(np.float32), "VEC3", ARRAY_BUFFER)}

        indices = self.accessor(inverse.reshape(-1).astype(np.uint32), "SCALAR", ELEMENT_ARRAY_BUFFER)
        self.gltf["meshes"][mesh]["primitives"].append(
            {"attributes": attributes, "indices": indices, "material": material}
        )

    def write(self, path: str) -> None:
        self.data.extend(b"\0" * ((4 - len(self.data) % 4) % 4))
        self.gltf["buffers"][0]["byteLength"] = len(self.data)

        for key in ("materials", "samplers", "textures", "images"):
            if not self.gltf[key]:
                del self.gltf[key]

        raw_json = json.dumps(self.gltf, separators=(",", ":")).encode()
        json_chunk = raw_json + b" " * ((4 - len(raw_json) % 4) % 4)
        total = 12 + 8 + len(json_chunk) + 8 + len(self.data)

        with open(path, "wb") as out:
            out.write(struct.pack("<III", 0x46546C67, 2, total))
            out.write(struct.pack("<II", len(json_chunk), 0x4E4F534A))
            out.write(json_chunk)
            out.write(struct.pack("<II", len(self.data), 0x004E4942))
            out.write(bytes(self.data))
