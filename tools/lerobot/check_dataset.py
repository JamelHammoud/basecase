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


def check_v3(root: Path) -> None:
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

    check_subtasks(dataset)
    print(f"v3.0: {dataset.num_episodes} episodes, {dataset.num_frames} frames, cameras {meta.video_keys}")


def check_subtasks(dataset: LeRobotDataset) -> None:
    meta = dataset.meta

    expect(meta.has_language_columns, f"{LANGUAGE} isn't declared in info.json")

    found = 0

    for episode in range(dataset.num_episodes):
        row = meta.episodes[episode]
        first = dataset[row["dataset_from_index"]][LANGUAGE]
        last = dataset[row["dataset_to_index"] - 1][LANGUAGE]

        expect(first == last, f"episode {episode} subtasks change between frames")
        expect(all(r["style"] == "subtask" and r["role"] == "assistant" for r in first), f"episode {episode} rows")
        expect(all(r["content"] for r in first), f"episode {episode} has an empty subtask")
        expect([r["timestamp"] for r in first] == sorted(r["timestamp"] for r in first), f"episode {episode} order")
        found += len(first)

    expect(found > 0, "no subtask read back")
    print(f"v3.0: {found} subtasks read from {LANGUAGE}")


def legacy_episodes(root: Path) -> list[dict]:
    lines = (root / "meta/episodes.jsonl").read_text().splitlines()

    return [json.loads(line) for line in lines if line]


def check_legacy(root: Path) -> None:
    info = json.loads((root / "meta/info.json").read_text())
    modality = json.loads((root / "meta/modality.json").read_text())
    joints = info["features"]["observation.state"]["shape"][0]
    groups = [g for g in modality["state"].values() if "original_key" not in g]

    expect(info["codebase_version"] == LEGACY, f"legacy version {info['codebase_version']}")
    expect(max(g["end"] for g in groups) == joints, "state groups don't cover the joints")

    for episode in legacy_episodes(root):
        index = episode["episode_index"]
        chunk = index // info["chunks_size"]
        data = root / info["data_path"].format(episode_chunk=chunk, episode_index=index)
        table = pq.read_table(data)

        expect(table.num_rows == episode["length"], f"v2.1 episode {index} rows")

        for name, video in modality["video"].items():
            key = video["original_key"]
            path = root / info["video_path"].format(episode_chunk=chunk, video_key=key, episode_index=index)

            expect(key in info["features"], f"modality camera {name}")
            expect(frame_count(path) == episode["length"], f"v2.1 episode {index} {key} frames")

    check_legacy_subtasks(root, info, modality)
    print(f"v2.1: {info['total_episodes']} episodes read with modality.json")


def check_legacy_subtasks(root: Path, info: dict, modality: dict) -> None:
    tasks = [json.loads(line)["task"] for line in (root / "meta/tasks.jsonl").read_text().splitlines() if line]
    episode_tasks = {task for episode in legacy_episodes(root) for task in episode["tasks"]}
    data = root / info["data_path"].format(episode_chunk=0, episode_index=0)
    subtasks = pq.read_table(data).column(SUBTASK).to_pylist()

    expect(SUBTASK.removeprefix("annotation.") in modality["annotation"], "modality.json has no subtask annotation")
    expect(info["total_tasks"] == len(tasks), "v2.1 task count")
    expect(all(0 <= i < len(tasks) for i in subtasks), "v2.1 subtask index out of range")
    expect(any(tasks[i] not in episode_tasks for i in subtasks), "v2.1 episode 0 has no subtask")


def main() -> None:
    root = Path(sys.argv[1]).resolve()

    check_v3(root)
    check_legacy(root / LEGACY)


if __name__ == "__main__":
    main()
