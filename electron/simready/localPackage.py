import os
import re
import zipfile
from collections.abc import Mapping
from pathlib import Path

from pxr import Sdf

MAX_PACKAGE = 32 * 1024 * 1024
MAX_FILES = 256


def local_path(root: Path, parent: Path, name: str) -> Path:
    if (
        not name
        or any(c in name for c in (":", "\\", "[", "]", "<", ">", "$", "`", "{", "}"))
        or Path(name).is_absolute()
    ):
        raise ValueError("Include only local USD dependencies")

    target = (parent / name).resolve()

    if not target.is_relative_to(root.resolve()) or not target.is_file():
        raise ValueError("Include every USD dependency in its package")

    return target


def unpack_usdz(source: Path) -> Path:
    output = source.parent / "unpacked"
    output.mkdir()

    with zipfile.ZipFile(source) as archive:
        entries = archive.infolist()

        if len(entries) > MAX_FILES or sum(e.file_size for e in entries) > MAX_PACKAGE:
            raise ValueError("Choose a USDZ package under 32 MB with at most 256 files")

        seen = set()

        for entry in entries:
            normalized = entry.filename.rstrip("/").casefold()

            if normalized in seen:
                raise ValueError("Include each USDZ file once")

            seen.add(normalized)
            path = Path(entry.filename)

            if any(not portable_segment(part) for part in path.parts):
                raise ValueError("Include portable USDZ file names")

            if path.is_absolute() or ".." in path.parts or ":" in entry.filename or "\\" in entry.filename:
                raise ValueError("Include only local USD dependencies")

            target = output / path

            if entry.is_dir():
                target.mkdir(parents=True, exist_ok=True)
                continue

            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(archive.read(entry))

    if not entries or Path(entries[0].filename).suffix.lower() not in (".usd", ".usda", ".usdc"):
        raise ValueError("Put the root USD layer first in USDZ")

    return output / entries[0].filename


def asset_values(value):
    if isinstance(value, Sdf.AssetPath):
        yield value.path
    elif isinstance(value, Mapping):
        for entry in value.values():
            yield from asset_values(entry)
    elif not isinstance(value, (str, bytes)) and hasattr(value, "__iter__"):
        for entry in value:
            yield from asset_values(entry)


def layer_assets(layer):
    names = set(layer.GetCompositionAssetDependencies()) | set(layer.GetExternalAssetDependencies())

    def collect(path):
        for field in layer.GetObjectAtPath(path).ListInfoKeys():
            if field == "clips":
                raise ValueError("Include static USD dependencies without value clips")

            if field == "subLayerOffsets":
                continue

            names.update(asset_values(layer.GetObjectAtPath(path).GetInfo(field)))

    layer.Traverse(Sdf.Path.absoluteRootPath, collect)
    return names


def checked_local_root(source: str, root: str | None = None) -> str:
    root_file = Path(source).resolve()
    package = Path(root).resolve() if root else root_file.parent

    if root_file.suffix.lower() == ".usdz":
        package = root_file.parent / "unpacked"
        root_file = unpack_usdz(root_file)

    visited: set[Path] = set()
    queue = [root_file]

    while queue:
        layer_path = queue.pop()

        if layer_path in visited:
            continue

        visited.add(layer_path)

        if len(visited) > MAX_FILES:
            raise ValueError("Choose a package with at most 256 USD layers")

        layer = Sdf.Layer.FindOrOpen(str(layer_path))

        if not layer:
            raise ValueError("Read the USD layer before importing")

        for name in layer_assets(layer):
            if not name:
                continue

            dependency = local_path(package, layer_path.parent, name)

            if dependency.suffix.lower() in (".usd", ".usda", ".usdc"):
                queue.append(dependency)
            elif dependency.suffix.lower() == ".usdz":
                raise ValueError("Unpack nested USDZ dependencies before importing")

    os.environ["PXR_AR_DEFAULT_SEARCH_PATH"] = str(package)
    return str(root_file)


def portable_segment(part: str) -> bool:
    stem = part.split(".")[0].strip()
    return not part.endswith((".", " ")) and not re.fullmatch(r"con|prn|aux|nul|com[0-9]|lpt[0-9]", stem, re.IGNORECASE)
