import copy
import json
import time

import numpy as np
import onnx
import onnxruntime as ort
import torch
from model import GenericModel

from data import image_tensor

PARITY_TOLERANCE = 0.001


def export_model(model, job, target):
    wrapper = GenericModel(copy.deepcopy(model).cpu(), job).eval()
    sample = torch.rand(1, 3, job["imageSize"], job["imageSize"])
    names = {
        "detect": ["detections"],
        "segment": ["detections", "masks"],
        "keypoints": ["detections", "keypoints"],
        "classify": ["classes"],
    }[job["kind"]]

    with torch.no_grad():
        expected = wrapper(sample)
        torch.onnx.export(
            wrapper,
            sample,
            str(target),
            input_names=["images"],
            output_names=names,
            opset_version=17,
            dynamo=False,
            external_data=False,
        )

    onnx.checker.check_model(str(target))
    session = ort.InferenceSession(str(target), providers=["CPUExecutionProvider"])
    actual = session.run(None, {"images": sample.numpy()})
    outputs = expected if isinstance(expected, tuple) else (expected,)
    error = max(float(np.abs(left.detach().numpy() - right).max()) for left, right in zip(outputs, actual, strict=True))

    if not np.isfinite(error) or error > PARITY_TOLERANCE:
        raise ValueError(f"The exported model did not match local inference: {error}.")

    return {"maxAbsoluteError": error, "tolerance": PARITY_TOLERANCE}


def overlap(first, second):
    x, y, width, height = first
    bx, by, bw, bh = second
    area = max(0, min(x + width, bx + bw) - max(x, bx)) * max(0, min(y + height, by + bh) - max(y, by))

    return area / max(1e-12, width * height + bw * bh - area)


def decoded(outputs, job):
    if job["kind"] == "classify":
        classes = [
            {"label": category["name"], "score": float(score)}
            for category, score in zip(job["classes"], outputs[0], strict=True)
        ]

        return {"detections": [], "classes": sorted(classes, key=lambda item: -item["score"])}

    detections = []

    for index in np.argsort(-outputs[0][:, 4], kind="stable"):
        row = outputs[0][index]
        if row[4] < 0.25:
            continue

        label = job["classes"][int(row[5])]["name"]
        item = {"label": label, "box": row[:4].tolist(), "score": float(row[4])}

        if any(previous["label"] == label and overlap(previous["box"], item["box"]) > 0.45 for previous in detections):
            continue

        attach_extra(item, outputs, job, index)
        detections.append(item)

    return {"detections": detections}


def attach_extra(item, outputs, job, index):
    if job["kind"] == "keypoints":
        item["keypoints"] = outputs[1][index].tolist()

    if job["kind"] == "segment":
        mask = outputs[1][index]
        item["mask"] = {
            "width": mask.shape[1],
            "height": mask.shape[0],
            "values": (mask > 0.5).astype(np.uint8).flatten().tolist(),
        }


def test_predictions(directory, job):
    session = ort.InferenceSession(str(directory / "model.onnx"), providers=["CPUExecutionProvider"])
    predictions = []

    for sample in job["samples"]:
        if sample["split"] != "test":
            continue

        image = image_tensor(directory, sample, job["imageSize"]).unsqueeze(0).numpy()
        started = time.perf_counter()
        outputs = session.run(None, {"images": image})
        elapsed = (time.perf_counter() - started) * 1000
        predictions.append({"id": sample["id"], "inferenceMs": elapsed, **decoded(outputs, job)})

    (directory / "predictions.json").write_text(json.dumps(predictions, allow_nan=False))
