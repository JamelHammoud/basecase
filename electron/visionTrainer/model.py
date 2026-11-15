from types import SimpleNamespace

import torch
from ultralytics.cfg import DEFAULT_CFG_DICT
from ultralytics.nn.tasks import ClassificationModel, DetectionModel, PoseModel, SegmentationModel
from ultralytics.utils import LOGGER

from data import keypoint_names


def make_model(job):
    LOGGER.setLevel("ERROR")
    options = {"nc": len(job["classes"]), "verbose": False}
    constructors = {
        "detect": (DetectionModel, "yolov8n.yaml"),
        "segment": (SegmentationModel, "yolov8n-seg.yaml"),
        "keypoints": (PoseModel, "yolov8n-pose.yaml"),
        "classify": (ClassificationModel, "yolov8n-cls.yaml"),
    }
    constructor, config = constructors[job["kind"]]

    if job["kind"] == "keypoints":
        options["data_kpt_shape"] = (len(keypoint_names(job)), 3)

    model = constructor(config, **options)
    model.args = SimpleNamespace(**{**DEFAULT_CFG_DICT, "overlap_mask": False})

    return model


def training_device(job):
    requested = job.get("device", "auto")
    available = torch.backends.mps.is_available()

    if requested == "mps" and not available:
        raise ValueError("MPS training needs an available Apple GPU.")

    return "mps" if available and requested != "cpu" else "cpu"


class GenericModel(torch.nn.Module):
    def __init__(self, model, job):
        super().__init__()
        self.network = model.eval()
        self.kind = job["kind"]
        self.size = job["imageSize"]
        self.classes = len(job["classes"])
        self.points = len(keypoint_names(job))
        head = self.network.model[-1]
        head.export = True
        head.format = "onnx"
        head.dynamic = False

    def forward(self, images):
        output = self.network(images)

        if self.kind == "classify":
            return output[0]

        prediction = output[0] if isinstance(output, tuple) else output
        rows = prediction[0].transpose(0, 1)
        class_scores = rows[:, 4 : 4 + self.classes]
        scores, labels = class_scores.max(dim=1)
        labels = torch.where(scores >= 0.25, labels, torch.zeros_like(labels))
        count = rows.shape[0]
        boxes = rows[:, :4] / self.size
        left = (boxes[:, :2] - boxes[:, 2:] / 2).clamp(0, 1)
        right = (boxes[:, :2] + boxes[:, 2:] / 2).clamp(0, 1)
        boxes = torch.cat((left, right - left), dim=1)
        detections = torch.cat((boxes, scores[:, None], labels[:, None].float()), dim=1)

        if self.kind == "keypoints":
            points = rows[:, 4 + self.classes :].reshape(count, self.points, 3)

            return detections, (points[:, :, :2] / self.size).clamp(0, 1)

        if self.kind == "segment":
            prototype = output[1][0]
            coefficients = rows[:, 4 + self.classes :]
            masks = (coefficients @ prototype.flatten(1)).sigmoid().reshape(count, *prototype.shape[1:])

            return detections, crop_masks(masks, boxes)

        return detections


def crop_masks(masks, boxes):
    height, width = masks.shape[1:]
    x = torch.arange(width, device=masks.device)[None, None, :]
    y = torch.arange(height, device=masks.device)[None, :, None]
    left = (boxes[:, 0, None, None] * width).round()
    top = (boxes[:, 1, None, None] * height).round()
    right = ((boxes[:, 0, None, None] + boxes[:, 2, None, None]) * width).round()
    bottom = ((boxes[:, 1, None, None] + boxes[:, 3, None, None]) * height).round()

    return masks * ((x >= left) & (x < right) & (y >= top) & (y < bottom))
