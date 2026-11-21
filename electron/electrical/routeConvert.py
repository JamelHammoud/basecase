import json
import sys
from pathlib import Path

import pcbnew
from routeCopper import remove_dangling_tracks


def convert(mode):
    if pcbnew.Version() != "9.0.6":
        raise ValueError("board-validator")

    source = "candidate.kicad_pcb" if mode == "cleanup" else "robot.kicad_pcb"
    board = pcbnew.LoadBoard(source)

    if mode == "cleanup":
        remove_dangling_tracks(board, json.loads(Path("cleanup.json").read_text()))
        pcbnew.SaveBoard("candidate.kicad_pcb", board)
        return

    if mode == "dsn":
        plan = json.loads(Path("routing.json").read_text())
        apply_plan(board, plan)
        add_exclusions(board, plan["exclusions"])

        if not pcbnew.ExportSpecctraDSN(board, "robot.dsn"):
            raise ValueError("board-route-failed")

        return

    if mode != "ses" or not pcbnew.ImportSpecctraSES(board, "robot.ses"):
        raise ValueError("board-route-failed")

    pcbnew.SaveBoard("candidate.kicad_pcb", board)


def apply_plan(board, plan):
    settings = board.GetDesignSettings()
    settings.m_CopperEdgeClearance = pcbnew.FromMM(plan["clearanceMm"])
    settings.m_MinClearance = pcbnew.FromMM(plan["clearanceMm"])
    settings.m_TrackMinWidth = pcbnew.FromMM(plan["trackWidthMm"])
    settings.m_ViasMinSize = pcbnew.FromMM(plan["viaDiameterMm"])
    default = board.GetAllNetClasses()["Default"]
    default.SetTrackWidth(pcbnew.FromMM(plan["trackWidthMm"]))
    default.SetClearance(pcbnew.FromMM(plan["clearanceMm"]))
    default.SetViaDiameter(pcbnew.FromMM(plan["viaDiameterMm"]))
    default.SetViaDrill(pcbnew.FromMM(plan["viaDrillMm"]))
    board.SynchronizeNetsAndNetClasses(True)


def add_exclusions(board, areas):
    for area in areas:
        zone = pcbnew.ZONE(board)
        zone.SetIsRuleArea(True)
        zone.SetDoNotAllowTracks(True)
        zone.SetDoNotAllowVias(True)
        zone.SetDoNotAllowCopperPour(True)
        zone.SetDoNotAllowPads(False)
        zone.SetDoNotAllowFootprints(False)
        zone.SetLayerSet(pcbnew.LSET.AllCuMask())
        outline = zone.Outline()
        outline.NewOutline()
        left, bottom = area["min"]
        right, top = area["max"]

        for x, y in [(left, bottom), (right, bottom), (right, top), (left, top)]:
            outline.Append(pcbnew.FromMM(x), pcbnew.FromMM(y))

        board.Add(zone)


convert(sys.argv[1])
