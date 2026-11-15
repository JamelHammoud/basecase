import hashlib
import json
import socket
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import numpy as np
import onnx
import torch
import train
from export import decoded
from model import GenericModel, crop_masks, training_device
from PIL import Image
from train import run

from data import annotation_mask, checked_job, resize_pixels


class FixedNetwork(torch.nn.Module):
    def __init__(self, output):
        super().__init__()
        self.model = torch.nn.ModuleList([torch.nn.Identity()])
        self.register_buffer("output", output)

    def forward(self, images):
        return self.output


def fixture(directory, kind):
    images = directory / "images"
    images.mkdir()
    samples = []
    splits = ["train", "train", "validation", "validation", "test"]

    for index, split in enumerate(splits):
        pixels = np.zeros((64, 64, 3), dtype=np.uint8)
        pixels[16:48, 16:48] = [200, 100, 50]
        Image.fromarray(pixels).save(images / f"sample-{index}.jpg")
        samples.append(
            {
                "id": f"sample-{index}",
                "split": split,
                "image": f"images/sample-{index}.jpg",
                "width": 64,
                "height": 64,
                "annotations": [
                    {
                        "classId": 7,
                        "box": [16, 16, 32, 32],
                        "polygons": [[16, 16, 48, 16, 48, 48, 16, 48]],
                        "keypoints": [{"name": "center", "x": 32, "y": 32, "visible": True}],
                        "mask": {"size": [64, 64], "counts": [1040, 32] + [32, 32] * 31 + [1040]},
                    }
                ],
            }
        )

    return {
        "version": 1,
        "kind": kind,
        "classes": [{"id": 7, "name": "block", "keypoints": ["center"]}, {"id": 9, "name": "other"}],
        "seed": 42,
        "epochs": 1,
        "batch": 2,
        "imageSize": 128,
        "device": "cpu",
        "samples": samples,
    }


class TrainingIntegration(unittest.TestCase):
    def test_actual_optimization_export_parity_and_test_isolation(self):
        for kind in ["detect", "segment", "keypoints", "classify"]:
            with self.subTest(kind=kind), tempfile.TemporaryDirectory() as temporary:
                directory = Path(temporary)
                job = fixture(directory, kind)
                (directory / "job.json").write_text(json.dumps(job))

                with patch.object(socket.socket, "connect", side_effect=AssertionError("Training must stay offline")):
                    result = run(directory)

                self.assertFalse(result["stopped"])
                self.assertGreater(result["parameterDelta"], 0)
                self.assertLessEqual(result["parity"]["maxAbsoluteError"], result["parity"]["tolerance"])
                predictions = json.loads((directory / "predictions.json").read_text())
                self.assertEqual([item["id"] for item in predictions], ["sample-4"])
                self.assertGreaterEqual(predictions[0]["inferenceMs"], 0)
                checkpoint = torch.load(directory / "checkpoint.pt", weights_only=True)
                self.assertEqual(sorted(checkpoint["trainedSamples"]), ["sample-0", "sample-1"])
                self.assertEqual(checkpoint["validatedSamples"], ["sample-2", "sample-3"])

    def test_larger_image_preserves_all_anchor_rows_in_onnx(self):
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            job = fixture(directory, "detect")
            job["imageSize"] = 256
            (directory / "job.json").write_text(json.dumps(job))

            with patch.object(socket.socket, "connect", side_effect=AssertionError("Training must stay offline")):
                result = run(directory)

            self.assertGreater(result["parameterDelta"], 0)
            self.assertLessEqual(result["parity"]["maxAbsoluteError"], result["parity"]["tolerance"])
            exported = onnx.load(str(directory / "model.onnx"))
            self.assertEqual(exported.graph.output[0].type.tensor_type.shape.dim[0].dim_value, 1344)

    def test_training_without_a_test_split_keeps_checkpoint_and_empty_predictions(self):
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            job = fixture(directory, "classify")
            job["samples"] = [sample for sample in job["samples"] if sample["split"] != "test"]
            (directory / "job.json").write_text(json.dumps(job))
            result = run(directory)
            self.assertFalse(result["stopped"])
            self.assertGreater(result["parameterDelta"], 0)
            self.assertTrue((directory / "checkpoint.pt").is_file())
            self.assertEqual(json.loads((directory / "predictions.json").read_text()), [])

    def test_stop_file_saves_and_resumes_optimizer(self):
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            job = fixture(directory, "classify")
            job["epochs"] = 2
            (directory / "job.json").write_text(json.dumps(job))
            progress = []

            def stop_after_epoch(message):
                if message["type"] == "progress":
                    progress.append(message)
                    (directory / "stop").touch()

            with patch.object(train, "emit", side_effect=stop_after_epoch):
                result = run(directory)

            self.assertTrue(result["stopped"])
            self.assertEqual(result["epoch"], 1)
            baseline = hashlib.sha256((directory / "baseline.onnx").read_bytes()).hexdigest()
            before = torch.load(directory / "checkpoint.pt", weights_only=True)
            self.assertEqual(max(value["step"].item() for value in before["optimizer"]["state"].values()), 1)
            (directory / "stop").unlink()
            job["resume"] = True
            (directory / "job.json").write_text(json.dumps(job))

            with patch.object(train, "emit", side_effect=lambda event: progress.append(event)):
                resumed = run(directory)

            self.assertEqual(resumed["epoch"], 2)
            self.assertGreater(resumed["parameterDelta"], 0)
            self.assertEqual(hashlib.sha256((directory / "baseline.onnx").read_bytes()).hexdigest(), baseline)
            after = torch.load(directory / "checkpoint.pt", weights_only=True)
            self.assertEqual(max(value["step"].item() for value in after["optimizer"]["state"].values()), 2)
            losses = [event["loss"] for event in progress if event["type"] == "progress"]
            self.assertLess(losses[-1], losses[0])

    def test_resume_mid_epoch_keeps_optimizer_rng_and_batch_cursor(self):
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            job = fixture(directory, "classify")
            job["samples"][2]["split"] = "train"
            (directory / "job.json").write_text(json.dumps(job))
            original_loss = train.loss_for

            def stop_after_batch(state, batch):
                loss = original_loss(state, batch)

                if state["model"].training:
                    (directory / "stop").touch()

                return loss

            with patch.object(train, "loss_for", side_effect=stop_after_batch):
                stopped = run(directory)

            self.assertTrue(stopped["stopped"])
            checkpoint = torch.load(directory / "checkpoint.pt", weights_only=True)
            self.assertEqual(checkpoint["epoch"], 0)
            self.assertEqual(checkpoint["cursor"], 2)
            self.assertEqual(len(checkpoint["optimizer"]["state"]), len(list(train.make_model(job).parameters())))
            (directory / "stop").unlink()
            job["resume"] = True
            (directory / "job.json").write_text(json.dumps(job))
            resumed = run(directory)
            self.assertFalse(resumed["stopped"])
            self.assertEqual(resumed["epoch"], 1)
            resumed_state = torch.load(directory / "checkpoint.pt", weights_only=True)["model"]
            comparison = directory / "comparison"
            comparison.mkdir()
            original_job = fixture(comparison, "classify")
            original_job["samples"][2]["split"] = "train"
            (comparison / "job.json").write_text(json.dumps(original_job))
            run(comparison)
            uninterrupted = torch.load(comparison / "checkpoint.pt", weights_only=True)["model"]
            self.assertTrue(all(torch.equal(value, uninterrupted[key]) for key, value in resumed_state.items()))

    def test_automatic_acceleration_trains_on_mps_or_cpu_and_exports_onnx(self):
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            job = fixture(directory, "classify")
            job["device"] = "auto"
            expected = "mps" if torch.backends.mps.is_available() else "cpu"
            self.assertEqual(training_device(job), expected)
            (directory / "job.json").write_text(json.dumps(job))
            result = run(directory)
            self.assertGreater(result["parameterDelta"], 0)
            self.assertLessEqual(result["parity"]["maxAbsoluteError"], result["parity"]["tolerance"])

    def test_generic_export_clips_keypoints_boxes_and_instance_masks(self):
        with tempfile.TemporaryDirectory() as temporary:
            job = fixture(Path(temporary), "keypoints")
            job["imageSize"] = 64
            output = torch.tensor([[[32, 32, 128, 128, 0.9, 0.1, 96, -16, 1]]]).transpose(1, 2)
            wrapper = GenericModel(FixedNetwork(output), job)
            detections, points = wrapper(torch.zeros(1, 3, 64, 64))
            self.assertEqual(detections[0, :4].tolist(), [0, 0, 1, 1])
            self.assertEqual(points.tolist(), [[[1, 0]]])
            masks = crop_masks(torch.ones(1, 4, 4), torch.tensor([[0.25, 0.25, 0.5, 0.5]]))
            self.assertEqual(masks.sum().item(), 4)
            self.assertEqual(masks[0, 0, 0].item(), 0)
            self.assertEqual(masks[0, 1, 1].item(), 1)

    def test_test_predictions_use_confidence_order_before_suppression(self):
        job = {"kind": "detect", "classes": [{"name": "block"}]}
        outputs = [np.array([[0, 0, 1, 1, 0.3, 0], [0, 0, 1, 1, 0.9, 0]], dtype=np.float32)]
        result = decoded(outputs, job)
        self.assertEqual(len(result["detections"]), 1)
        self.assertAlmostEqual(result["detections"][0]["score"], 0.9)

    def test_preprocessing_matches_half_pixel_bilinear_without_byte_rounding(self):
        pixels = np.array([[[0, 0, 0], [255, 255, 255]]], dtype=np.float32)
        resized = resize_pixels(pixels, 4)
        np.testing.assert_allclose(resized[0, :, 0], [0, 63.75, 191.25, 255])

    def test_segmentation_masks_preserve_holes_and_reject_oversized_runs(self):
        sample = {"width": 3, "height": 3}
        annotation = {"mask": {"size": [3, 3], "counts": [0, 4, 1, 4]}}
        mask = annotation_mask(annotation, sample, 3)
        self.assertEqual(mask.sum().item(), 8)
        self.assertEqual(mask[1, 1].item(), 0)
        annotation["mask"]["counts"] = [1_000_000_000]

        with self.assertRaises(ValueError):
            annotation_mask(annotation, sample, 3)

    def test_output_tensor_bounds_refuse_oversized_segmentation(self):
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            job = fixture(directory, "segment")
            job["imageSize"] = 352
            (directory / "job.json").write_text(json.dumps(job))

            with self.assertRaisesRegex(ValueError, "320 pixels"):
                checked_job(directory)

            job["kind"] = "detect"
            job["imageSize"] = 672
            (directory / "job.json").write_text(json.dumps(job))

            with self.assertRaises(ValueError):
                checked_job(directory)

    def test_refuses_paths_and_split_overlap_before_training(self):
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            job = fixture(directory, "detect")
            job["samples"][0]["image"] = "../outside.jpg"
            (directory / "job.json").write_text(json.dumps(job))

            with self.assertRaises(ValueError):
                run(directory)

            job["samples"][0]["image"] = job["samples"][-1]["image"]
            (directory / "job.json").write_text(json.dumps(job))

            with self.assertRaises(ValueError):
                run(directory)


if __name__ == "__main__":
    unittest.main()
