"""Material looks: a base colour, or an albedo texture (times its tint), read from any common shader."""

import os
from dataclasses import dataclass

import numpy as np
from PIL import Image
from pxr import Sdf, Usd, UsdGeom, UsdShade

TEXTURE_INPUTS = (
    "diffuse_texture",
    "albedo_texture",
    "base_color_texture",
    "basecolor_texture",
    "diffuse_reflection_color_image",
    "diffuseColor",
    "base_color",
    "baseColor",
)
COLOR_INPUTS = ("diffuseColor", "diffuse_color_constant", "base_color", "baseColor", "albedo_color")
TINT_INPUTS = ("diffuse_tint", "base_color_tint", "albedo_tint")
GREY = np.array([0.7, 0.7, 0.7])
TEXTURE_SIDE = 256


def linear_to_srgb(c: np.ndarray) -> np.ndarray:
    c = np.clip(c, 0.0, 1.0)
    return np.where(c <= 0.0031308, c * 12.92, 1.055 * np.power(c, 1 / 2.4) - 0.055)


@dataclass
class Look:
    color: np.ndarray
    image: np.ndarray | None = None
    path: str | None = None

    def sample(self, uv: np.ndarray | None, count: int) -> np.ndarray:
        """Average colour of each triangle: uv is (n, 3, 2); samples the centroid and three inner points."""
        if self.image is None or uv is None:
            return np.tile(self.color, (count, 1))

        h, w = self.image.shape[:2]
        centroid = uv.mean(axis=1, keepdims=True)
        points = np.concatenate([centroid, (2 * uv + centroid) / 3], axis=1)
        u = np.mod(points[..., 0], 1.0)
        v = np.mod(points[..., 1], 1.0)
        x = np.clip((u * w).astype(np.int64), 0, w - 1)
        y = np.clip(((1 - v) * h).astype(np.int64), 0, h - 1)
        return self.image[y, x].mean(axis=1) * self.color


def asset_path(value) -> str | None:
    if isinstance(value, Sdf.AssetPath) and value.resolvedPath:
        return value.resolvedPath

    return None


class LookReader:
    def __init__(self) -> None:
        self.images: dict[str, np.ndarray | None] = {}
        self.looks: dict[str, Look] = {}

    def image(self, path: str) -> np.ndarray | None:
        if path not in self.images:
            self.images[path] = self.load(path)

        return self.images[path]

    @staticmethod
    def load(path: str) -> np.ndarray | None:
        if not os.path.isfile(path):
            return None

        try:
            with Image.open(path) as img:
                rgb = img.convert("RGB")
                rgb.thumbnail((TEXTURE_SIDE, TEXTURE_SIDE))
                return np.asarray(rgb, dtype=np.float64) / 255
        except (OSError, ValueError):
            return None

    @staticmethod
    def texture_asset(inp: UsdShade.Input):
        """The texture file behind an input: its own asset path, or the file of the texture node feeding it."""
        value = inp.Get()

        if isinstance(value, Sdf.AssetPath) or not inp.HasConnectedSource():
            return value if isinstance(value, Sdf.AssetPath) else None

        file_input = UsdShade.Shader(inp.GetConnectedSource()[0].GetPrim()).GetInput("file")
        raw = file_input.Get() if file_input else None
        return raw if isinstance(raw, Sdf.AssetPath) else None

    def input_texture(self, inp: UsdShade.Input) -> tuple[np.ndarray | None, bool, str | None]:
        """The texture behind an input, whether one was authored at all (even if missing), and its file."""
        asset = self.texture_asset(inp)
        path = asset_path(asset)
        authored = bool(asset is not None and asset.path)
        return (self.image(path) if path else None), authored, path

    @staticmethod
    def constant(shader: UsdShade.Shader, names: tuple[str, ...]) -> np.ndarray | None:
        for name in names:
            inp = shader.GetInput(name)
            value = inp.Get() if inp and not inp.HasConnectedSource() else None

            if value is not None and not isinstance(value, Sdf.AssetPath) and len(value) >= 3:
                return linear_to_srgb(np.array(value[:3], dtype=np.float64))

        return None

    def shader_look(self, shader: UsdShade.Shader) -> Look | None:
        tint = self.constant(shader, TINT_INPUTS)
        missing = False

        for name in TEXTURE_INPUTS:
            inp = shader.GetInput(name)
            image, authored, path = self.input_texture(inp) if inp else (None, False, None)

            if image is not None:
                return Look(color=tint if tint is not None else np.ones(3), image=image, path=path)

            missing = missing or authored

        color = self.constant(shader, COLOR_INPUTS)

        if color is not None and not missing:
            return Look(color=color * (tint if tint is not None else 1))

        return None

    def material_look(self, material: UsdShade.Material) -> Look | None:
        key = str(material.GetPrim().GetPath())

        if key in self.looks:
            return self.looks[key]

        found = None

        for prim in Usd.PrimRange(material.GetPrim(), Usd.TraverseInstanceProxies(Usd.PrimAllPrimsPredicate)):
            found = self.shader_look(UsdShade.Shader(prim)) if prim.IsA(UsdShade.Shader) else None

            if found:
                break

        self.looks[key] = found
        return found

    def prim_look(self, prim: Usd.Prim) -> Look | None:
        material = UsdShade.MaterialBindingAPI(prim).ComputeBoundMaterial()[0]
        return self.material_look(material) if material else None

    @staticmethod
    def display_look(prim: Usd.Prim) -> Look:
        display = UsdGeom.PrimvarsAPI(prim).GetPrimvar("displayColor")
        value = display.Get() if display else None

        if value is not None and len(value):
            return Look(color=linear_to_srgb(np.array(value[0], dtype=np.float64)))

        return Look(color=GREY)
