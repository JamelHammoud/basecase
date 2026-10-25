"""Rigid bodies and joints from UsdPhysics (plus MuJoCo actuator limits), as a tree rooted at the base."""

import math
from dataclasses import dataclass, field

import numpy as np
from frames import StageFrame, gf_to_np
from pxr import Gf, Usd, UsdGeom, UsdPhysics, UsdShade

AXES = {"X": (1.0, 0.0, 0.0), "Y": (0.0, 1.0, 0.0), "Z": (0.0, 0.0, 1.0)}
NO_LIMIT = 1e6


@dataclass
class Body:
    prim: Usd.Prim
    name: str
    world: np.ndarray
    frame: np.ndarray
    mass: float | None = None
    com: np.ndarray | None = None
    density: float | None = None
    part_mass: float = 0.0


@dataclass
class Joint:
    name: str
    type: str
    parent: str
    child: str
    frame: np.ndarray
    axis: tuple[float, float, float]
    limit: tuple[float, float] | None = None
    effort: float | None = None
    velocity: float | None = None


@dataclass
class Physics:
    bodies: dict[str, Body] = field(default_factory=dict)
    joints: list[Joint] = field(default_factory=list)
    root: str | None = None
    friction: float | None = None
    notes: list[str] = field(default_factory=list)


def all_prims(stage: Usd.Stage):
    return stage.Traverse(Usd.TraverseInstanceProxies(Usd.PrimAllPrimsPredicate))


def unique_name(prim: Usd.Prim, taken: set[str]) -> str:
    base = prim.GetName() or "body"
    name = base
    n = 2

    while name in taken:
        name = f"{base}_{n}"
        n += 1

    taken.add(name)
    return name


def finite(v) -> bool:
    return v is not None and math.isfinite(float(v))


def body_mass(body: Body, prim: Usd.Prim, frame: StageFrame) -> None:
    if not prim.HasAPI(UsdPhysics.MassAPI):
        return

    api = UsdPhysics.MassAPI(prim)
    mass = api.GetMassAttr().Get()
    density = api.GetDensityAttr().Get()
    com = api.GetCenterOfMassAttr().Get()

    if finite(mass) and mass > 0:
        body.mass = float(mass)

    if finite(density) and density > 0:
        body.density = float(density)

    if com is not None and all(finite(c) and abs(c) < NO_LIMIT for c in com):
        world_com = frame.points(np.array([com], dtype=np.float64), body.world)[0]
        inv = np.linalg.inv(body.frame)
        body.com = inv[:3, :3] @ world_com + inv[:3, 3]


def read_bodies(stage: Usd.Stage, frame: StageFrame, xf: UsdGeom.XformCache) -> dict[str, Body]:
    bodies: dict[str, Body] = {}
    taken: set[str] = set()

    for prim in all_prims(stage):
        if not prim.HasAPI(UsdPhysics.RigidBodyAPI):
            continue

        enabled = UsdPhysics.RigidBodyAPI(prim).GetRigidBodyEnabledAttr().Get()

        if enabled is False:
            continue

        world = gf_to_np(xf.GetLocalToWorldTransform(prim))
        body = Body(prim=prim, name=unique_name(prim, taken), world=world, frame=frame.frame(world))
        body_mass(body, prim, frame)
        bodies[str(prim.GetPath())] = body

    collider_masses(stage, bodies)
    return bodies


def material_density(prim: Usd.Prim) -> float | None:
    material = UsdShade.MaterialBindingAPI(prim).ComputeBoundMaterial("physics")[0]

    if not material or not material.GetPrim().HasAPI(UsdPhysics.MaterialAPI):
        return None

    value = UsdPhysics.MaterialAPI(material.GetPrim()).GetDensityAttr().Get()
    return float(value) if finite(value) and value > 0 else None


def collider_masses(stage: Usd.Stage, bodies: dict[str, Body]) -> None:
    """Mass set on a body's colliders counts toward the body (UsdPhysics mass rules)."""
    for prim in all_prims(stage):
        path = str(prim.GetPath())

        if path in bodies or not (prim.HasAPI(UsdPhysics.MassAPI) or prim.HasAPI(UsdPhysics.CollisionAPI)):
            continue

        body = owning_body(path, bodies)

        if body is None:
            continue

        mass = UsdPhysics.MassAPI(prim).GetMassAttr().Get() if prim.HasAPI(UsdPhysics.MassAPI) else None

        if finite(mass) and mass > 0:
            body.part_mass += float(mass)

        if body.density is None and prim.HasAPI(UsdPhysics.CollisionAPI):
            body.density = material_density(prim)

    for body in bodies.values():
        if body.mass is None and body.part_mass > 0:
            body.mass = body.part_mass


def owning_body(path: str, bodies: dict[str, Body]) -> Body | None:
    at = path

    while at and at != "/":
        if at in bodies:
            return bodies[at]

        at = at.rsplit("/", 1)[0] or "/"

    return None


def target_body(rel: Usd.Relationship, bodies: dict[str, Body]) -> Body | None:
    targets = rel.GetTargets() if rel else []
    return owning_body(str(targets[0]), bodies) if targets else None


def joint_frame(joint: UsdPhysics.Joint, body: Body, frame: StageFrame, side: int) -> np.ndarray:
    pos = (joint.GetLocalPos0Attr() if side == 0 else joint.GetLocalPos1Attr()).Get() or Gf.Vec3f(0, 0, 0)
    rot = (joint.GetLocalRot0Attr() if side == 0 else joint.GetLocalRot1Attr()).Get() or Gf.Quatf(1, 0, 0, 0)
    local = Gf.Matrix4d().SetRotate(Gf.Rotation(Gf.Quatd(rot))).SetTranslateOnly(Gf.Vec3d(pos))
    return frame.frame(body.world @ gf_to_np(local))


def joint_limits(prim: Usd.Prim, kind: str, frame: StageFrame) -> tuple[float, float] | None:
    api = UsdPhysics.RevoluteJoint(prim) if kind == "revolute" else UsdPhysics.PrismaticJoint(prim)
    lo, hi = api.GetLowerLimitAttr().Get(), api.GetUpperLimitAttr().Get()

    if not (finite(lo) and finite(hi)) or abs(lo) >= NO_LIMIT or abs(hi) >= NO_LIMIT or lo > hi:
        return None

    if kind == "revolute":
        return (math.radians(lo), math.radians(hi))

    return (lo * frame.meters_per_unit, hi * frame.meters_per_unit)


def drive_effort(prim: Usd.Prim, kind: str) -> float | None:
    drive = UsdPhysics.DriveAPI.Get(prim, "angular" if kind == "revolute" else "linear")
    value = drive.GetMaxForceAttr().Get() if drive else None
    return float(value) if finite(value) and 0 < value < NO_LIMIT else None


def joint_velocity(prim: Usd.Prim, kind: str) -> float | None:
    for name in ("newton:velocityLimit", "physxJoint:maxJointVelocity", "mjc:velocityLimit"):
        attr = prim.GetAttribute(name)
        value = attr.Get() if attr else None

        if finite(value) and 0 < value < NO_LIMIT:
            return math.radians(value) if kind == "revolute" and name.startswith("physx") else float(value)

    return None


def actuator_efforts(stage: Usd.Stage) -> dict[str, float]:
    out: dict[str, float] = {}

    for prim in all_prims(stage):
        if prim.GetTypeName() != "MjcActuator" or not prim.IsActive():
            continue

        hi = prim.GetAttribute("mjc:forceRange:max").Get()
        rel = prim.GetRelationship("mjc:target")
        targets = rel.GetTargets() if rel else []

        if targets and finite(hi) and hi > 0:
            out[str(targets[0])] = float(hi)

    return out


JOINT_TYPES = ((UsdPhysics.RevoluteJoint, "revolute"), (UsdPhysics.PrismaticJoint, "prismatic"))


def joint_kind(prim: Usd.Prim) -> str | None:
    for schema, kind in JOINT_TYPES:
        if prim.IsA(schema):
            return kind

    return "fixed" if prim.IsA(UsdPhysics.Joint) else None


def is_enabled(joint: UsdPhysics.Joint) -> bool:
    if joint.GetJointEnabledAttr().Get() is False:
        return False

    return joint.GetExcludeFromArticulationAttr().Get() is not True


@dataclass
class Edge:
    prim: Usd.Prim
    kind: str
    body0: Body | None
    body1: Body | None


def read_edges(stage: Usd.Stage, bodies: dict[str, Body], notes: list[str]) -> list[Edge]:
    edges: list[Edge] = []

    for prim in all_prims(stage):
        kind = joint_kind(prim)

        if kind is None or not is_enabled(UsdPhysics.Joint(prim)):
            continue

        if kind == "fixed" and prim.GetTypeName() not in ("PhysicsFixedJoint", "PhysicsJoint"):
            notes.append(f"{prim.GetName()} ({prim.GetTypeName()}) is held fixed")

        joint = UsdPhysics.Joint(prim)
        edges.append(
            Edge(prim, kind, target_body(joint.GetBody0Rel(), bodies), target_body(joint.GetBody1Rel(), bodies))
        )

    return edges


def pick_root(bodies: dict[str, Body], edges: list[Edge]) -> Body | None:
    for e in edges:
        one = e.body1 if e.body0 is None else e.body0 if e.body1 is None else None

        if one is not None:
            return one

    children = {id(e.body1) for e in edges if e.body0 is not None and e.body1 is not None}

    for body in bodies.values():
        if id(body) not in children:
            return body

    return next(iter(bodies.values()), None)


@dataclass
class TreeBuild:
    frame: StageFrame
    efforts: dict[str, float]
    out: Physics


def tree_joint(tb: TreeBuild, edge: Edge, parent: Body, child: Body) -> Joint:
    side = 0 if edge.body0 is parent else 1
    api = UsdPhysics.Joint(edge.prim)
    j_frame = joint_frame(api, parent, tb.frame, side)
    axis = (1.0, 0.0, 0.0)
    limit = None
    effort = None
    velocity = None

    if edge.kind != "fixed":
        token = (UsdPhysics.RevoluteJoint if edge.kind == "revolute" else UsdPhysics.PrismaticJoint)(edge.prim)
        axis = AXES.get(str(token.GetAxisAttr().Get()), (1.0, 0.0, 0.0))

        if side == 1:
            axis = tuple(-a for a in axis)

        limit = joint_limits(edge.prim, edge.kind, tb.frame)
        effort = tb.efforts.get(str(edge.prim.GetPath())) or drive_effort(edge.prim, edge.kind)
        velocity = joint_velocity(edge.prim, edge.kind)

    return Joint(
        name=edge.prim.GetName(),
        type=edge.kind,
        parent=parent.name,
        child=child.name,
        frame=j_frame,
        axis=axis,
        limit=limit,
        effort=effort,
        velocity=velocity,
    )


def grow_tree(tb: TreeBuild, root: Body, edges: list[Edge]) -> None:
    seen = {id(root)}
    queue = [root]
    linked = [e for e in edges if e.body0 is not None and e.body1 is not None and e.body0 is not e.body1]

    while queue:
        at = queue.pop(0)

        for e in linked:
            other = e.body1 if e.body0 is at else e.body0 if e.body1 is at else None

            if other is None or id(other) in seen:
                continue

            seen.add(id(other))
            queue.append(other)
            tb.out.joints.append(tree_joint(tb, e, at, other))

    loops = sum(1 for e in linked if id(e.body0) in seen and id(e.body1) in seen) - len(tb.out.joints)

    if loops > 0:
        tb.out.notes.append(f"{loops} closed-loop joints left out")

    for body in tb.out.bodies.values():
        if id(body) not in seen:
            tb.out.joints.append(
                Joint(f"{body.name}_fixed", "fixed", root.name, body.name, body.frame.copy(), (1.0, 0.0, 0.0))
            )


def physics_friction(stage: Usd.Stage, root: Body | None) -> float | None:
    if root is None:
        return None

    values: list[float] = []

    for prim in Usd.PrimRange(root.prim, Usd.TraverseInstanceProxies(Usd.PrimAllPrimsPredicate)):
        if not prim.HasAPI(UsdPhysics.CollisionAPI):
            continue

        material = UsdShade.MaterialBindingAPI(prim).ComputeBoundMaterial("physics")[0]

        if material and material.GetPrim().HasAPI(UsdPhysics.MaterialAPI):
            value = UsdPhysics.MaterialAPI(material.GetPrim()).GetDynamicFrictionAttr().Get()

            if finite(value) and value > 0:
                values.append(float(value))

    return round(sum(values) / len(values), 3) if values else None


def read_physics(stage: Usd.Stage, frame: StageFrame, xf: UsdGeom.XformCache) -> Physics:
    out = Physics(bodies=read_bodies(stage, frame, xf))

    if not out.bodies:
        return out

    edges = read_edges(stage, out.bodies, out.notes)
    root = pick_root(out.bodies, edges)
    out.root = root.name if root else None

    if root is not None:
        grow_tree(TreeBuild(frame=frame, efforts=actuator_efforts(stage), out=out), root, edges)

    out.friction = physics_friction(stage, root)
    return out
