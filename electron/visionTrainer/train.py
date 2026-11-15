import argparse
import json
import os
import random
import sys
from pathlib import Path

os.environ.setdefault("YOLO_OFFLINE", "true")
os.environ.setdefault("YOLO_AUTOINSTALL", "false")
os.environ.setdefault("YOLO_CONFIG_DIR", str(Path.cwd() / ".ultralytics"))

import numpy as np
import torch
from export import export_model, test_predictions
from model import make_model, training_device

from data import checked_job, make_batch, signature


def emit(message):
    print(json.dumps(message, allow_nan=False), flush=True)


def save_checkpoint(state, directory):
    checkpoint = {
        "version": 1,
        "signature": state["signature"],
        "epoch": state["epoch"],
        "model": state["model"].state_dict(),
        "optimizer": state["optimizer"].state_dict(),
        "trainedSamples": state["trainedSamples"],
        "validatedSamples": state["validatedSamples"],
        "bestValidation": state["bestValidation"],
        "random": torch.get_rng_state(),
        "order": state["order"],
        "cursor": state["cursor"],
        "losses": state["losses"],
        "mpsRandom": torch.mps.get_rng_state() if next(state["model"].parameters()).device.type == "mps" else None,
    }
    torch.save(checkpoint, directory / "checkpoint.tmp")
    os.replace(directory / "checkpoint.tmp", directory / "checkpoint.pt")


def initial_state(directory, job):
    model = make_model(job).to(training_device(job))
    optimizer = torch.optim.AdamW(model.parameters(), lr=0.001)
    state = {
        "model": model,
        "optimizer": optimizer,
        "signature": signature(directory, job),
        "epoch": 0,
        "trainedSamples": [],
        "validatedSamples": [],
        "bestValidation": float("inf"),
        "order": [],
        "cursor": 0,
        "losses": [],
    }

    if not job.get("resume"):
        export_model(model, job, directory / "baseline.onnx")

        return state

    checkpoint_file = directory / "checkpoint.pt"

    if checkpoint_file.is_symlink() or checkpoint_file.stat().st_size > 256 * 1024 * 1024:
        raise ValueError("Choose a local training checkpoint.")

    checkpoint = torch.load(checkpoint_file, map_location="cpu", weights_only=True)

    if checkpoint.get("version") != 1 or checkpoint["signature"] != state["signature"]:
        raise ValueError("Resume needs the same frozen dataset and training settings.")

    model.load_state_dict(checkpoint["model"])
    optimizer.load_state_dict(checkpoint["optimizer"])
    torch.set_rng_state(checkpoint["random"])
    state.update(
        {
            key: checkpoint[key]
            for key in ["epoch", "trainedSamples", "validatedSamples", "bestValidation", "order", "cursor", "losses"]
        }
    )

    if training_device(job) == "mps" and checkpoint["mpsRandom"] is not None:
        torch.mps.set_rng_state(checkpoint["mpsRandom"])

    return state


def loss_for(state, batch):
    device = next(state["model"].parameters()).device
    converted = {key: value.to(device) for key, value in batch.items()}
    loss, _ = state["model"](converted)

    return loss.sum()


def batches(samples, count):
    for start in range(0, len(samples), count):
        yield samples[start : start + count]


def validate(state, directory, job):
    state["model"].eval()
    samples = [sample for sample in job["samples"] if sample["split"] == "validation"]
    losses = []

    with torch.no_grad():
        for selected in batches(samples, job["batch"]):
            losses.append(float(loss_for(state, make_batch(directory, selected, job)).cpu()))

    state["validatedSamples"] = [sample["id"] for sample in samples]

    return sum(losses) / len(losses)


def train_epoch(state, directory, job):
    if (directory / "stop").exists():
        return None

    state["model"].train()
    samples = [sample for sample in job["samples"] if sample["split"] == "train"]
    state["order"] = state["order"] or torch.randperm(len(samples)).tolist()
    selected_samples = [samples[index] for index in state["order"][state["cursor"] :]]

    for selected in batches(selected_samples, max(2, job["batch"])):
        if (directory / "stop").exists():
            return None

        chosen = selected if len(selected) > 1 else selected * 2
        state["optimizer"].zero_grad(set_to_none=True)
        loss = loss_for(state, make_batch(directory, chosen, job))

        if not torch.isfinite(loss):
            raise ValueError("Training produced a nonfinite loss.")

        loss.backward()
        torch.nn.utils.clip_grad_norm_(state["model"].parameters(), 10)
        state["optimizer"].step()
        state["losses"].append(float(loss.detach().cpu()))
        state["cursor"] += len(selected)
        state["trainedSamples"] = list(dict.fromkeys(state["trainedSamples"] + [sample["id"] for sample in selected]))

    average = sum(state["losses"]) / len(state["losses"])
    state.update({"order": [], "cursor": 0, "losses": []})

    return average


def optimize(state, directory, job):
    while state["epoch"] < job["epochs"]:
        loss = train_epoch(state, directory, job)

        if loss is None:
            save_checkpoint(state, directory)

            return True

        validation = validate(state, directory, job)
        state["epoch"] += 1

        if validation < state["bestValidation"]:
            state["bestValidation"] = validation
            torch.save(state["model"].state_dict(), directory / "best.tmp")
            os.replace(directory / "best.tmp", directory / "best.pt")

        save_checkpoint(state, directory)
        emit(
            {
                "type": "progress",
                "epoch": state["epoch"],
                "epochs": job["epochs"],
                "loss": loss,
                "validation": validation,
            }
        )

    return False


def run(directory):
    directory = Path(directory)
    job = checked_job(directory)
    torch.set_num_threads(2)
    torch.manual_seed(job["seed"])
    np.random.seed(job["seed"])
    random.seed(job["seed"])
    state = initial_state(directory, job)
    initial = [parameter.detach().cpu().clone() for parameter in state["model"].parameters()]
    stopped = optimize(state, directory, job)
    delta = sum(
        float((before - after.detach().cpu()).abs().sum())
        for before, after in zip(initial, state["model"].parameters(), strict=True)
    )
    result = {
        "type": "done",
        "stopped": stopped,
        "epoch": state["epoch"],
        "checkpoint": "checkpoint.pt",
        "parameterDelta": delta,
    }

    if stopped:
        (directory / "result.json").write_text(json.dumps(result, allow_nan=False))
        emit(result)

        return result

    state["model"].load_state_dict(torch.load(directory / "best.pt", map_location="cpu", weights_only=True))
    parity = export_model(state["model"], job, directory / "model.onnx")
    test_predictions(directory, job)
    result.update(
        {
            "model": "model.onnx",
            "baseline": "baseline.onnx",
            "predictions": "predictions.json",
            "adapter": "generic",
            "input": {
                "width": job["imageSize"],
                "height": job["imageSize"],
                "layout": "nchw",
                "mean": [0, 0, 0],
                "std": [1, 1, 1],
                "resize": "stretch",
                "color": "rgb",
                "scale": 1 / 255,
            },
            "parity": parity,
        }
    )
    (directory / "result.json").write_text(json.dumps(result, allow_nan=False))
    emit(result)

    return result


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--job", required=True)
    arguments = parser.parse_args()

    try:
        run(Path(arguments.job))
    except Exception as error:
        emit({"type": "error", "message": str(error)})
        sys.exit(1)


if __name__ == "__main__":
    main()
