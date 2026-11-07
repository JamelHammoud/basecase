"""Compares Forge's learner against torch on the same network, batch and targets."""

import json
import sys

import torch
from torch import nn


def build(layers):
    modules = []
    for i, layer in enumerate(layers):
        linear = nn.Linear(layer["in"], layer["out"])
        with torch.no_grad():
            linear.weight.copy_(torch.tensor(layer["w"]).reshape(layer["out"], layer["in"]))
            linear.bias.copy_(torch.tensor(layer["b"]))
        modules.append(linear)
        if i < len(layers) - 1:
            modules.append(nn.ELU())
    return nn.Sequential(*modules)


def main():
    with open(sys.argv[1]) as f:
        vector = json.load(f)
    net = build(vector["initial"])
    opt = torch.optim.Adam(net.parameters(), lr=vector["lr"])
    x = torch.tensor(vector["x"])
    y = torch.tensor(vector["y"])
    for _ in range(vector["steps"]):
        loss = (net(x) - y).pow(2).mean()
        opt.zero_grad()
        loss.backward()
        opt.step()
    worst = 0.0
    linears = [m for m in net if isinstance(m, nn.Linear)]
    for linear, want in zip(linears, vector["final"], strict=True):
        w = torch.tensor(want["w"]).reshape(want["out"], want["in"])
        worst = max(worst, float((linear.weight - w).abs().max()))
        worst = max(worst, float((linear.bias - torch.tensor(want["b"])).abs().max()))
    print(json.dumps({"worst": worst}))


if __name__ == "__main__":
    main()
