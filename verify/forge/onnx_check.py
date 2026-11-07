"""Checks a Forge ONNX export loads and matches the actions recorded beside it."""

import json
import sys

import numpy as np
import onnx
from onnx.reference import ReferenceEvaluator


def main():
    folder = sys.argv[1]
    model = onnx.load(f"{folder}/policy.onnx")
    onnx.checker.check_model(model)
    with open(f"{folder}/policy-check.json") as f:
        check = json.load(f)
    evaluator = ReferenceEvaluator(model)
    worst = 0.0
    for sample in check["samples"]:
        obs = np.array([sample["obs"]], dtype=np.float32)
        out = evaluator.run(None, {"obs": obs})[0][0]
        worst = max(worst, float(np.max(np.abs(out - np.array(sample["action"], dtype=np.float32)))))
    print(json.dumps({"worst": worst, "samples": len(check["samples"])}))


if __name__ == "__main__":
    main()
