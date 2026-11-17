import re

import pcbnew


def remove_dangling_tracks(board, ids):
    if not isinstance(ids, list) or len(ids) > 4096:
        raise ValueError("board-format")

    if any(
        not isinstance(value, str) or not re.fullmatch(r"[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}", value)
        for value in ids
    ):
        raise ValueError("board-format")

    if len(set(ids)) != len(ids):
        raise ValueError("board-format")

    selected = set(ids)
    items = list(board.GetTracks())
    tracks = [item for item in items if str(item.m_Uuid.AsString()) in selected]

    if len(tracks) != len(selected) or any(isinstance(item, pcbnew.PCB_VIA) for item in tracks):
        raise ValueError("board-format")

    identities = {track_identity(item) for item in tracks}
    copies = [item for item in items if not isinstance(item, pcbnew.PCB_VIA) and track_identity(item) in identities]

    for item in copies:
        board.Remove(item)


def track_identity(item):
    start, end = item.GetStart(), item.GetEnd()
    ends = tuple(sorted([(start.x, start.y), (end.x, end.y)]))
    return item.GetNetCode(), item.GetLayer(), item.GetWidth(), ends
