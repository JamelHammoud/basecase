import sys
import tempfile
from pathlib import Path

import pcbnew
import wx

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "electron" / "electrical"))

from routeCopper import remove_dangling_tracks


def track(board, start, end, layer=pcbnew.F_Cu):
    item = pcbnew.PCB_TRACK(board)
    item.SetStart(pcbnew.VECTOR2I(pcbnew.FromMM(start[0]), pcbnew.FromMM(start[1])))
    item.SetEnd(pcbnew.VECTOR2I(pcbnew.FromMM(end[0]), pcbnew.FromMM(end[1])))
    item.SetWidth(pcbnew.FromMM(0.4))
    item.SetLayer(layer)
    item.SetNetCode(1)
    board.Add(item)
    return item


def board_with_pads():
    board = pcbnew.BOARD()
    net = pcbnew.NETINFO_ITEM(board, "/wire", 1)
    board.Add(net)
    footprint = pcbnew.FOOTPRINT(board)
    board.Add(footprint)

    for i, x in enumerate([0, 10]):
        pad = pcbnew.PAD(footprint)
        pad.SetNumber(str(i + 1))
        pad.SetNet(net)
        pad.SetAttribute(pcbnew.PAD_ATTRIB_PTH)
        pad.SetShape(pcbnew.PAD_SHAPE_CIRCLE)
        pad.SetSize(pcbnew.VECTOR2I(pcbnew.FromMM(1.9), pcbnew.FromMM(1.9)))
        pad.SetLayerSet(pcbnew.LSET.AllCuMask())
        pad.SetPosition(pcbnew.VECTOR2I(pcbnew.FromMM(x), 0))
        footprint.Add(pad)

    return board


def check_stubs():
    board = board_with_pads()
    track(board, (0, 0), (10, 0))
    removable = [
        track(board, (5, 0), (5, 0.1)),
        track(board, (20, 20), (21, 21)),
        track(board, (40, 40), (40, 40)),
    ]
    track(board, (5, 0.1), (5, 0))
    remove_dangling_tracks(board, [str(item.m_Uuid.AsString()) for item in removable])
    assert len(list(board.GetTracks())) == 1


def check_vias():
    board = board_with_pads()
    track(board, (0, 0), (5, 0))
    track(board, (5, 0), (10, 0), pcbnew.B_Cu)
    via = pcbnew.PCB_VIA(board)
    via.SetPosition(pcbnew.VECTOR2I(pcbnew.FromMM(5), 0))
    via.SetWidth(pcbnew.FromMM(0.8))
    via.SetDrill(pcbnew.FromMM(0.4))
    via.SetViaType(pcbnew.VIATYPE_THROUGH)
    via.SetNetCode(1)
    via.SetLayerPair(pcbnew.F_Cu, pcbnew.B_Cu)
    board.Add(via)
    remove_dangling_tracks(board, [])
    assert len(list(board.GetTracks())) == 3

    for ids in [[str(via.m_Uuid.AsString())], ["ffffffff-ffff-ffff-ffff-ffffffffffff"]]:
        try:
            remove_dangling_tracks(board, ids)
        except ValueError:
            assert len(list(board.GetTracks())) == 3
        else:
            raise AssertionError("Only matched track identities can be removed")


def check_session_point():
    board = board_with_pads()
    board.SetFileName("robot.kicad_pcb")

    with tempfile.TemporaryDirectory(prefix="basecase-ses-compat-") as directory:
        session = Path(directory) / "point.ses"
        session.write_text(
            "(session robot (base_design robot) (placement) (was_is) "
            "(routes (resolution um 10) (library_out) (network_out (net /wire "
            "(wire (path F.Cu 4000 0 0 100000 0)) (wire (path F.Cu 4000 50000 0))))))"
        )
        assert pcbnew.ImportSpecctraSES(board, str(session))

    tracks = list(board.GetTracks())
    assert len(tracks) == 1
    assert tracks[0].GetStart() != tracks[0].GetEnd()
    assert tracks[0].GetNetCode() == 1
    assert tracks[0].GetWidth() == pcbnew.FromMM(0.4)


app = wx.AppConsole()
check_stubs()
check_vias()
check_session_point()
print("Generated copper cleanup retains connected tracks and through vias")
