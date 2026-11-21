import json
import sys

import pcbnew


def inspect(board):
    pads = [
        {"reference": footprint.GetReference(), "pad": pad.GetNumber(), "net": pad.GetNetname()}
        for footprint in board.GetFootprints()
        for pad in footprint.Pads()
        if pad.GetNumber()
    ]
    holes = [
        pcbnew.ToMM(pad.GetDrillSize().x)
        for footprint in board.GetFootprints()
        for pad in footprint.Pads()
        if pad.GetAttribute() == pcbnew.PAD_ATTRIB_NPTH
    ]

    locations = [
        {
            "reference": footprint.GetReference(),
            "pad": pad.GetNumber(),
            "position": [pcbnew.ToMM(pad.GetPosition().x), pcbnew.ToMM(pad.GetPosition().y)],
            "side": "bottom" if footprint.IsFlipped() else "top",
        }
        for footprint in board.GetFootprints()
        for pad in footprint.Pads()
        if pad.GetNumber()
    ]

    return {
        "pads": sorted(pads, key=lambda pad: (pad["reference"], pad["pad"])),
        "holes": holes,
        "locations": locations,
    }


def perturb(board, mode):
    footprints = [part for part in board.GetFootprints() if part.GetReference().startswith("BC_")]

    if mode == "swap":
        pads = list(footprints[0].Pads())
        first, second = next(
            (a, b) for a in pads for b in pads if a.GetNetname() and b.GetNetname() and a.GetNetname() != b.GetNetname()
        )
        first_net, second_net = first.GetNet(), second.GetNet()
        first.SetNet(second_net)
        second.SetNet(first_net)

    if mode == "overlap":
        footprints[1].SetPosition(footprints[0].GetPosition())

    if mode == "outline":
        edge = board.GetBoardEdgesBoundingBox().GetRight()
        footprints[0].SetPosition(pcbnew.VECTOR2I(edge, 0))


if sys.argv[1] == "--inspect-many":
    print(json.dumps([inspect(pcbnew.LoadBoard(filename)) for filename in sys.argv[2:]]))
    sys.exit(0)

board_path = sys.argv[1]
loaded = pcbnew.LoadBoard(board_path)
mode = sys.argv[2] if len(sys.argv) > 2 else "inspect"

if mode != "inspect":
    perturb(loaded, mode)
    pcbnew.SaveBoard(board_path, loaded)

print(json.dumps(inspect(loaded)))
