"""Stage units and axes: everything leaves here in meters, Z up, as column-vector 4x4 matrices."""

from dataclasses import dataclass

import numpy as np
from pxr import Gf, UsdGeom

Y_UP_TO_Z_UP = np.array([[1.0, 0.0, 0.0], [0.0, 0.0, -1.0], [0.0, 1.0, 0.0]])


def gf_to_np(m: Gf.Matrix4d) -> np.ndarray:
    """USD matrices act on row vectors (p * M); numpy here uses column vectors (A @ p)."""
    return np.array(m, dtype=np.float64).T


def orthonormal(r: np.ndarray) -> np.ndarray:
    u, _, vt = np.linalg.svd(r)
    out = u @ vt

    if np.linalg.det(out) < 0:
        u[:, -1] *= -1
        out = u @ vt

    return out


@dataclass
class StageFrame:
    meters_per_unit: float
    up: np.ndarray

    @classmethod
    def of(cls, stage) -> "StageFrame":
        mpu = UsdGeom.GetStageMetersPerUnit(stage) or 1.0
        up = Y_UP_TO_Z_UP if UsdGeom.GetStageUpAxis(stage) == UsdGeom.Tokens.y else np.eye(3)
        return cls(meters_per_unit=float(mpu), up=up)

    def points(self, pts: np.ndarray, world: np.ndarray) -> np.ndarray:
        """Local points through a full world matrix (scale included), to stage meters Z-up."""
        p = pts @ world[:3, :3].T + world[:3, 3]
        return (p * self.meters_per_unit) @ self.up.T

    def frame(self, world: np.ndarray) -> np.ndarray:
        """A rigid frame (no scale) for a body or joint, in meters Z-up."""
        out = np.eye(4)
        out[:3, :3] = self.up @ orthonormal(world[:3, :3])
        out[:3, 3] = self.up @ (world[:3, 3] * self.meters_per_unit)
        return out


def column_major(m: np.ndarray) -> list[float]:
    return [round(float(v), 9) for v in m.flatten(order="F")]


def to_local(frame: np.ndarray, pts: np.ndarray) -> np.ndarray:
    inv = np.linalg.inv(frame)
    return pts @ inv[:3, :3].T + inv[:3, 3]
