# /// script
# requires-python = ">=3.12,<3.13"
# dependencies = ["lerobot[dataset]==0.7.0"]
#
# [tool.uv]
# exclude-newer = "2026-11-13T00:00:00Z"
#
# [[tool.uv.index]]
# name = "pytorch-cpu"
# url = "https://download.pytorch.org/whl/cpu"
# explicit = true
#
# [tool.uv.sources]
# torch = { index = "pytorch-cpu" }
# torchvision = { index = "pytorch-cpu" }
# ///
import json
import sys
from collections import Counter
from pathlib import Path

import av
import pyarrow.parquet as pq
from lerobot.datasets.language_render import active_at
from lerobot.datasets.lerobot_dataset import LeRobotDataset

LEGACY = "v2.1"
VECTORS = {"observation.state", "action", "observation.scan"}
LANGUAGE = "language_persistent"
SUBTASK = "annotation.human.action.task_description"


def fail(message: str) -> None:
    raise SystemExit(f"LeRobot check failed: {message}")


def expect(condition: bool, message: str) -> None:
    if not condition:
        fail(message)


def frame_count(path: Path) -> int:
    with av.open(str(path)) as container:
        return sum(1 for _ in container.decode(video=0))


def subtask_at(frame: dict) -> str:
    row = active_at(float(frame["timestamp"]), persistent=frame[LANGUAGE], style="subtask")

    expect(row is not None, f"no subtask at frame {int(frame['index'])}")

    return row["content"]


def v3_subtasks(dataset: LeRobotDataset) -> list[str]:
    expect(dataset.meta.features[LANGUAGE]["dtype"] == "language", "language_persistent feature")

    frames = dataset.hf_dataset
    subtasks = [subtask_at(frames[i]) for i in range(len(frames))]
    first = dataset.meta.episodes[0]
    last = first["dataset_to_index"] - 1
    item = dataset[last]

    expect(subtask_at(item) == subtasks[last], "dataset[i] reads another subtask than its row")
    expect(len(set(subtasks[first["dataset_from_index"] : last + 1])) > 1, "episode 0 has one subtask")

    return subtasks


def check_v3(root: Path) -> list[str]:
    info = json.loads((root / "meta/info.json").read_text())
    dataset = LeRobotDataset("basecase/fixture", root=root, video_backend="pyav")
    meta = dataset.meta

    expect(info["codebase_version"] == "v3.0", f"version {info['codebase_version']}")
    expect(dataset.num_episodes == info["total_episodes"], "episode count")
    expect(dataset.num_frames == info["total_frames"], "frame count")

    rows = Counter(int(i) for i in dataset.hf_dataset["episode_index"])

    for episode in range(dataset.num_episodes):
        row = meta.episodes[episode]
        length = row["length"]

        expect(rows[episode] == length, f"episode {episode} has {rows[episode]} rows, not {length}")
        expect(row["dataset_to_index"] - row["dataset_from_index"] == length, f"episode {episode} index range")

        for key in meta.video_keys:
            span = row[f"videos/{key}/to_timestamp"] - row[f"videos/{key}/from_timestamp"]

            expect(abs(span - length / meta.fps) < 1e-6, f"episode {episode} {key} spans {span} s")

    task = meta.tasks.iloc[0].name
    last = dataset[dataset.num_frames - 1]

    expect(isinstance(task, str) and last["task"] == task, f"task {task!r}")

    for key in meta.video_keys:
        shape = tuple(last[key].shape)

        expect(shape == (3, *meta.features[key]["shape"][:2]), f"{key} decoded as {shape}")
        expect(meta.stats[key]["mean"].shape == (3, 1, 1), f"{key} stats")

    for key in VECTORS & set(info["features"]):
        shape = tuple(last[key].shape)

        expect(shape == tuple(info["features"][key]["shape"]), f"{key} read as {shape}")
        expect(meta.stats[key]["count"][0] == dataset.num_frames, f"{key} stats count")

    subtasks = v3_subtasks(dataset)

    print(f"v3.0: {dataset.num_episodes} episodes, {dataset.num_frames} frames, cameras {meta.video_keys}")
    print(f"v3.0 subtasks by frame: {Counter(subtasks)}")

    return subtasks


def legacy_episodes(root: Path) -> list[dict]:
    lines = (root / "meta/episodes.jsonl").read_text().splitlines()

    return [json.loads(line) for line in lines if line]


def legacy_tasks(root: Path) -> list[str]:
    lines = (root / "meta/tasks.jsonl").read_text().splitlines()
    rows = [json.loads(line) for line in lines if line]

    expect([r["task_index"] for r in rows] == list(range(len(rows))), "tasks.jsonl indices")

    return [r["task"] for r in rows]


def check_legacy(root: Path, subtasks: list[str]) -> None:
    info = json.loads((root / "meta/info.json").read_text())
    modality = json.loads((root / "meta/modality.json").read_text())
    joints = info["features"]["observation.state"]["shape"][0]
    groups = [g for g in modality["state"].values() if "original_key" not in g]

    expect(info["codebase_version"] == LEGACY, f"legacy version {info['codebase_version']}")
    expect(max(g["end"] for g in groups) == joints, "state groups don't cover the joints")
    expect(SUBTASK.removeprefix("annotation.") in modality["annotation"], "modality has no subtask annotation")

    tasks = legacy_tasks(root)
    read: list[str] = []

    for episode in legacy_episodes(root):
        index = episode["episode_index"]
        chunk = index // info["chunks_size"]
        data = root / info["data_path"].format(episode_chunk=chunk, episode_index=index)
        table = pq.read_table(data)

        expect(table.num_rows == episode["length"], f"v2.1 episode {index} rows")
        read += [tasks[i] for i in table.column(SUBTASK).to_pylist()]

        for name, video in modality["video"].items():
            key = video["original_key"]
            path = root / info["video_path"].format(episode_chunk=chunk, video_key=key, episode_index=index)

            expect(key in info["features"], f"modality camera {name}")
            expect(frame_count(path) == episode["length"], f"v2.1 episode {index} {key} frames")

    expect(read == subtasks, "v2.1 subtask annotations differ from v3.0 language_persistent")
    print(f"v2.1: {info['total_episodes']} episodes read with modality.json, subtasks match v3.0")


def main() -> None:
    root = Path(sys.argv[1]).resolve()

    check_legacy(root / LEGACY, check_v3(root))


if __name__ == "__main__":
    main()
