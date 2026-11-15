import hashlib
import json
import re

import numpy as np
import torch
from PIL import Image

KINDS = {"detect", "segment", "keypoints", "classify"}


def bounded(value, lower, upper):
    return type(value) is int and lower <= value <= upper


def image_path(directory, name):
    if not isinstance(name, str) or not re.fullmatch(r"images/[A-Za-z0-9_-]{1,128}\.jpg", name):
        raise ValueError("Training images must stay inside the job.")

    target = directory / name

    if target.is_symlink() or target.parent.is_symlink() or not target.is_file():
        raise ValueError("Training images must be regular local files.")

    if target.stat().st_size > 64 * 1024 * 1024:
        raise ValueError("The training image exceeds the size limit.")

    return target


def checked_job(directory):
    source = directory / "job.json"

    if source.is_symlink() or source.stat().st_size > 16 * 1024 * 1024:
        raise ValueError("The training job exceeds the size limit.")

    job = json.loads(source.read_text())
    limits = [("seed", 0, 0xFFFFFFFF), ("epochs", 1, 1000), ("batch", 1, 64), ("imageSize", 32, 640)]

    if job.get("version") != 1 or job.get("kind") not in KINDS:
        raise ValueError("Choose a supported vision training task.")

    if not all(bounded(job.get(key), low, high) for key, low, high in limits) or job["imageSize"] % 32:
        raise ValueError("Choose bounded training settings.")

    if job.get("device", "auto") not in {"auto", "cpu", "mps"} or type(job.get("resume", False)) is not bool:
        raise ValueError("Choose CPU, MPS or automatic training.")

    if job["kind"] == "segment" and job["imageSize"] > 320:
        raise ValueError("Segmentation training supports images up to 320 pixels.")

    check_classes(job)
    check_samples(directory, job)

    return job


def check_classes(job):
    classes = job.get("classes")

    if not isinstance(classes, list) or not 1 <= len(classes) <= 1000:
        raise ValueError("Choose the training classes.")

    for category in classes:
        if not bounded(category.get("id"), 0, 0xFFFFFFFF) or not isinstance(category.get("name"), str):
            raise ValueError("Choose named training classes.")

        points = category.get("keypoints", [])

        if not isinstance(points, list) or len(points) > 256 or not all(isinstance(p, str) for p in points):
            raise ValueError("Choose bounded keypoint names.")

    if len({c["id"] for c in classes}) != len(classes) or len({c["name"] for c in classes}) != len(classes):
        raise ValueError("Give each training class a unique id and name.")

    if job["kind"] == "classify" and len(classes) < 2:
        raise ValueError("Classification training needs at least two classes.")

    if job["kind"] == "keypoints" and not 1 <= len(keypoint_names(job)) <= 256:
        raise ValueError("Keypoint training needs named landmarks.")


def check_samples(directory, job):
    samples = job.get("samples")

    if not isinstance(samples, list) or not 2 <= len(samples) <= 100_000:
        raise ValueError("Choose frozen training images.")

    seen = set()
    paths = set()
    splits = set()

    for sample in samples:
        identity = sample.get("id")
        split = sample.get("split")
        target = image_path(directory, sample.get("image"))

        if not isinstance(identity, str) or not 1 <= len(identity) <= 256 or identity in seen or target in paths:
            raise ValueError("Each frozen image must belong to one split.")

        if split not in {"train", "validation", "test"}:
            raise ValueError("Choose train, validation or test splits.")

        seen.add(identity)
        paths.add(target)
        splits.add(split)
        check_image(sample, target)
        check_annotations(sample, job)

    if not {"train", "validation"}.issubset(splits):
        raise ValueError("Training needs separate train and validation images.")


def check_image(sample, target):
    width, height = sample.get("width"), sample.get("height")

    if not bounded(width, 1, 8192) or not bounded(height, 1, 8192) or width * height > 16_777_216:
        raise ValueError("Choose bounded image dimensions.")

    with Image.open(target) as image:
        if image.format != "JPEG" or image.size != (width, height):
            raise ValueError("The frozen training image dimensions changed.")


def check_annotations(sample, job):
    annotations = sample.get("annotations")
    ids = {c["id"] for c in job["classes"]}

    if not isinstance(annotations, list) or len(annotations) > 10_000:
        raise ValueError("Choose bounded image annotations.")

    if job["kind"] == "classify" and len(annotations) != 1:
        raise ValueError("Each classification image needs exactly one class.")

    for annotation in annotations:
        box = annotation.get("box", [])

        if annotation.get("classId") not in ids or len(box) != 4 or not np.isfinite(box).all():
            raise ValueError("Check the training image labels.")

        x, y, width, height = box

        if min(x, y) < 0 or min(width, height) <= 0 or x + width > sample["width"] or y + height > sample["height"]:
            raise ValueError("Keep training boxes inside their image.")

        check_points(annotation, sample, job)


def check_points(annotation, sample, job):
    points = annotation.get("keypoints", [])
    category = next(category for category in job["classes"] if category["id"] == annotation["classId"])
    names = category.get("keypoints", [])

    if not isinstance(points, list) or len(points) > len(names):
        raise ValueError("Check the training landmark count.")

    for point in points:
        coordinates = [point.get("x"), point.get("y")]

        if (
            point.get("name") not in names
            or type(point.get("visible")) is not bool
            or not np.isfinite(coordinates).all()
        ):
            raise ValueError("Check the training landmarks.")

        if point["visible"] and not (0 <= point["x"] < sample["width"] and 0 <= point["y"] < sample["height"]):
            raise ValueError("Keep visible training landmarks inside their image.")

    if len({point["name"] for point in points}) != len(points):
        raise ValueError("Give each training landmark a unique name.")


def keypoint_names(job):
    return list(dict.fromkeys(name for category in job["classes"] for name in category.get("keypoints", [])))


def signature(directory, job):
    immutable = {key: value for key, value in job.items() if key not in {"resume", "device"}}
    digest = hashlib.sha256(json.dumps(immutable, sort_keys=True).encode())

    for sample in job["samples"]:
        digest.update(image_path(directory, sample["image"]).read_bytes())

    return digest.hexdigest()


def image_tensor(directory, sample, size):
    with Image.open(image_path(directory, sample["image"])) as image:
        pixels = resize_pixels(np.asarray(image.convert("RGB"), dtype=np.float32), size)

    return torch.from_numpy(pixels).permute(2, 0, 1).float() / 255


def resize_pixels(pixels, size):
    height, width = pixels.shape[:2]
    x = (np.arange(size, dtype=np.float32) + 0.5) * width / size - 0.5
    y = (np.arange(size, dtype=np.float32) + 0.5) * height / size - 0.5
    x0 = np.clip(np.floor(x).astype(int), 0, width - 1)
    y0 = np.clip(np.floor(y).astype(int), 0, height - 1)
    x1 = np.minimum(x0 + 1, width - 1)
    y1 = np.minimum(y0 + 1, height - 1)
    dx = np.maximum(0, x - x0)[None, :, None]
    dy = np.maximum(0, y - y0)[:, None, None]
    top = pixels[y0[:, None], x0] * (1 - dx) + pixels[y0[:, None], x1] * dx
    bottom = pixels[y1[:, None], x0] * (1 - dx) + pixels[y1[:, None], x1] * dx

    return (top * (1 - dy) + bottom * dy).astype(np.float32)


def annotation_mask(annotation, sample, size):
    mask = annotation.get("mask", {})
    counts = mask.get("counts", [])
    length = sample["width"] * sample["height"]

    if mask.get("size") != [sample["height"], sample["width"]] or not 1 <= len(counts) <= length + 1:
        raise ValueError("Check the frozen segmentation mask dimensions.")

    if (
        not all(bounded(count, 0 if index == 0 else 1, length) for index, count in enumerate(counts))
        or sum(counts) != length
    ):
        raise ValueError("Check the frozen segmentation mask runs.")

    pixels = np.repeat(np.arange(len(counts), dtype=np.uint32) % 2, counts).astype(np.uint8)
    image = Image.fromarray(pixels.reshape(sample["width"], sample["height"]).T)

    return torch.from_numpy(np.asarray(image.resize((size, size), Image.Resampling.NEAREST)).copy()).float()


def annotation_points(annotation, sample, names):
    points = {point["name"]: point for point in annotation.get("keypoints", [])}
    result = []

    for name in names:
        point = points.get(name)
        result.append(
            [point["x"] / sample["width"], point["y"] / sample["height"], 2]
            if point and point["visible"]
            else [0, 0, 0]
        )

    return result


def make_batch(directory, samples, job):
    size = job["imageSize"]
    classes = {category["id"]: index for index, category in enumerate(job["classes"])}
    batch = {"img": torch.stack([image_tensor(directory, sample, size) for sample in samples])}

    if job["kind"] == "classify":
        batch["cls"] = torch.tensor([classes[sample["annotations"][0]["classId"]] for sample in samples])

        return batch

    entries = [
        (index, sample, annotation) for index, sample in enumerate(samples) for annotation in sample["annotations"]
    ]
    batch["batch_idx"] = torch.tensor([entry[0] for entry in entries])
    batch["cls"] = torch.tensor([[classes[entry[2]["classId"]]] for entry in entries], dtype=torch.float32).reshape(
        -1, 1
    )
    batch["bboxes"] = torch.tensor([normalized_box(sample, annotation) for _, sample, annotation in entries]).reshape(
        -1, 4
    )

    if job["kind"] == "segment":
        batch["masks"] = (
            torch.stack([annotation_mask(a, s, size) for _, s, a in entries]) if entries else torch.empty(0, size, size)
        )

    if job["kind"] == "keypoints":
        names = keypoint_names(job)
        batch["keypoints"] = torch.tensor([annotation_points(a, s, names) for _, s, a in entries]).reshape(
            -1, len(names), 3
        )

    return batch


def normalized_box(sample, annotation):
    x, y, width, height = annotation["box"]

    return [
        (x + width / 2) / sample["width"],
        (y + height / 2) / sample["height"],
        width / sample["width"],
        height / sample["height"],
    ]
