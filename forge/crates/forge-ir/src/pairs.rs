use crate::bodies::same_frame;
use crate::kernel::{Body, Collider, FrictionMix, Geom, Pair, Shape};
use crate::names::Names;
use crate::read::{vec2, vec3, vec4, vec5, Reader};
use crate::refuse::nonzero;

const MIN_MU: f64 = 1e-5;
const MIN_VAL: f64 = 1e-15;
const TYPE_NAMES: [&str; 9] = [
    "plane",
    "height field",
    "sphere",
    "capsule",
    "ellipsoid",
    "cylinder",
    "box",
    "mesh",
    "SDF",
];

struct GeomTable<'a> {
    kind: &'a [i32],
    contype: &'a [i32],
    conaffinity: &'a [i32],
    condim: &'a [i32],
    body: &'a [i32],
    priority: &'a [i32],
    solmix: &'a [f64],
    solref: &'a [f64],
    solimp: &'a [f64],
    friction: &'a [f64],
    margin: &'a [f64],
    gap: &'a [f64],
}

impl<'a> GeomTable<'a> {
    fn read(r: &Reader<'a>) -> Result<Self, String> {
        Ok(Self {
            kind: r.i32s("geom_type")?,
            contype: r.i32s("geom_contype")?,
            conaffinity: r.i32s("geom_conaffinity")?,
            condim: r.i32s("geom_condim")?,
            body: r.i32s("geom_bodyid")?,
            priority: r.i32s("geom_priority")?,
            solmix: r.f64s("geom_solmix")?,
            solref: r.f64s("geom_solref")?,
            solimp: r.f64s("geom_solimp")?,
            friction: r.f64s("geom_friction")?,
            margin: r.f64s("geom_margin")?,
            gap: r.f64s("geom_gap")?,
        })
    }

    fn bitmask_allows(&self, a: usize, b: usize) -> bool {
        self.contype[a] & self.conaffinity[b] != 0 || self.contype[b] & self.conaffinity[a] != 0
    }
}

fn shape(kind: i32, dataid: i32) -> Option<Shape> {
    match kind {
        0 => Some(Shape::Plane),
        2 => Some(Shape::Sphere),
        3 => Some(Shape::Capsule),
        5 => Some(Shape::Cylinder),
        6 => Some(Shape::Box),
        7 => usize::try_from(dataid).ok().map(Shape::Mesh),
        _ => None,
    }
}

pub fn geoms(r: &Reader, names: &Names, reasons: &mut Vec<String>) -> Result<Vec<Geom>, String> {
    let n = r.size("ngeom")?;
    let (kind, dataid, body) = (r.i32s("geom_type")?, r.i32s("geom_dataid")?, r.i32s("geom_bodyid")?);
    let (pos, quat, size) = (r.f64s("geom_pos")?, r.f64s("geom_quat")?, r.f64s("geom_size")?);
    let friction = r.f64s("geom_friction")?;
    let sameframe = r.u8s("geom_sameframe")?;
    let (surfacevel, adhesion) = (r.f64s("geom_surfacevel")?, r.f64s("geom_adhesion")?);
    let mut out = Vec::with_capacity(n);

    for g in 0..n {
        if nonzero(&surfacevel[6 * g..6 * g + 6]) || adhesion[g] != 0.0 {
            reasons.push(format!("{} has surface velocity or adhesion", names.get("geom", g)));
        }

        out.push(Geom {
            shape: shape(kind[g], dataid[g]).unwrap_or(Shape::Sphere),
            body: body[g] as usize,
            pos: vec3(pos, g),
            quat: vec4(quat, g),
            frame: same_frame(sameframe[g]),
            size: vec3(size, g),
            friction: vec3(friction, g),
        });
    }

    Ok(out)
}

fn bodies_filtered(bodies: &[Body], b1: usize, b2: usize, filter_parent: bool) -> bool {
    let (w1, w2) = (bodies[b1].weld, bodies[b2].weld);
    let (p1, p2) = (bodies[bodies[w1].parent].weld, bodies[bodies[w2].parent].weld);

    w1 == w2
        || (bodies[w1].dofnum == 0 && bodies[w2].dofnum == 0)
        || (filter_parent && w1 != 0 && w2 != 0 && (w1 == p2 || w2 == p1))
}

fn mix(t: &GeomTable, g1: usize, g2: usize) -> (usize, [f64; 2], [f64; 5], [f64; 3]) {
    let pick = |g: usize| {
        let f = vec3(t.friction, g);

        (t.condim[g] as usize, vec2(t.solref, g), vec5(t.solimp, g), f)
    };

    if t.priority[g1] != t.priority[g2] {
        return pick(if t.priority[g1] > t.priority[g2] { g1 } else { g2 });
    }

    let (s1, s2) = (t.solmix[g1], t.solmix[g2]);
    let weight = match (s1 >= MIN_VAL, s2 >= MIN_VAL) {
        (true, true) => s1 / (s1 + s2),
        (false, false) => 0.5,
        (false, true) => 0.0,
        (true, false) => 1.0,
    };
    let (r1, r2) = (vec2(t.solref, g1), vec2(t.solref, g2));
    let solref = if r1[0] > 0.0 && r2[0] > 0.0 {
        [0, 1].map(|i| weight * r1[i] + (1.0 - weight) * r2[i])
    } else {
        [0, 1].map(|i| r1[i].min(r2[i]))
    };
    let (i1, i2) = (vec5(t.solimp, g1), vec5(t.solimp, g2));
    let solimp = [0, 1, 2, 3, 4].map(|i| weight * i1[i] + (1.0 - weight) * i2[i]);
    let friction = [0, 1, 2].map(|i| t.friction[3 * g1 + i].max(t.friction[3 * g2 + i]));

    (t.condim[g1].max(t.condim[g2]) as usize, solref, solimp, friction)
}

fn collider(t1: i32, t2: i32) -> Option<(Collider, usize)> {
    match (t1, t2) {
        (0, 2) => Some((Collider::PlaneSphere, 1)),
        (0, 3) => Some((Collider::PlaneCapsule, 2)),
        (0, 5) => Some((Collider::PlaneCylinder, 4)),
        (0, 6) => Some((Collider::PlaneBox, 4)),
        (0, 7) => Some((Collider::PlaneConvex, 4)),
        _ => None,
    }
}

pub struct PairInput<'a> {
    pub bodies: &'a [Body],
    pub filter_parent: bool,
}

pub fn pairs(r: &Reader, names: &Names, input: &PairInput, reasons: &mut Vec<String>) -> Result<Vec<Pair>, String> {
    let t = GeomTable::read(r)?;
    let n = t.kind.len();
    let mut out = Vec::new();

    for a in 0..n {
        for b in a + 1..n {
            let (b1, b2) = (t.body[a] as usize, t.body[b] as usize);

            if b1 == b2 || bodies_filtered(input.bodies, b1, b2, input.filter_parent) || !t.bitmask_allows(a, b) {
                continue;
            }

            let (g1, g2) = if t.kind[a] > t.kind[b] { (b, a) } else { (a, b) };
            let moving = |body: usize| input.bodies[input.bodies[body].weld].dofnum > 0;

            if moving(b1) && moving(b2) {
                reasons.push(format!(
                    "{} and {} can touch while both move, and Forge only collides against static geometry",
                    names.get("geom", g1),
                    names.get("geom", g2)
                ));
                continue;
            }

            let Some((kind, max_contacts)) = collider(t.kind[g1], t.kind[g2]) else {
                reasons.push(format!(
                    "{} and {} can touch, and Forge has no {}-{} collider",
                    names.get("geom", g1),
                    names.get("geom", g2),
                    TYPE_NAMES.get(t.kind[g1] as usize).unwrap_or(&"unknown"),
                    TYPE_NAMES.get(t.kind[g2] as usize).unwrap_or(&"unknown"),
                ));
                continue;
            };
            let (condim, solref, solimp, fr) = mix(&t, g1, g2);

            if condim != 1 && condim != 3 {
                reasons.push(format!(
                    "{} and {} make condim {condim} contacts, and Forge supports condim 1 and 3",
                    names.get("geom", g1),
                    names.get("geom", g2)
                ));
            }

            out.push(Pair {
                collider: kind,
                geoms: [g1, g2],
                condim,
                friction: [fr[0], fr[0], fr[1], fr[2], fr[2]].map(|f| f.max(MIN_MU)),
                mix: match t.priority[g1].cmp(&t.priority[g2]) {
                    std::cmp::Ordering::Equal => FrictionMix::Max,
                    std::cmp::Ordering::Greater => FrictionMix::First,
                    std::cmp::Ordering::Less => FrictionMix::Second,
                },
                solref,
                solimp,
                margin: t.margin[g1] + t.margin[g2],
                gap: t.gap[g1] + t.gap[g2],
                max_contacts,
            });
        }
    }

    Ok(out)
}
