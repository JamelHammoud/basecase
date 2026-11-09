use crate::block::Block;
use crate::plan::Plan;
use forge_ir::FrictionMix;

const MIN_MU: f64 = 1e-5;

#[derive(Clone, Debug)]
pub struct Contact {
    pub slot: usize,
    pub body: usize,
    pub local: [f64; 3],
    pub frame: [f64; 9],
    pub offset: f64,
    pub slide: f64,
}

#[derive(Clone, Debug)]
pub struct Frozen {
    pub contacts: Vec<Contact>,
    pub qacc: Vec<f64>,
}

fn at<const K: usize>(v: &[crate::lanes::V], i: usize, lane: usize) -> [f64; K] {
    std::array::from_fn(|k| v[K * i + k].0[lane])
}

fn slide(plan: &Plan, b: &Block, pair: usize, lane: usize) -> f64 {
    let p = &plan.kernel.pairs[pair];
    let [g1, g2] = p.geoms;
    let (f1, f2) = (b.tables.friction[g1].0[lane], b.tables.friction[g2].0[lane]);
    let mixed = match p.mix {
        FrictionMix::Max => f1.max(f2),
        FrictionMix::First => f1,
        FrictionMix::Second => f2,
    };

    mixed.max(MIN_MU)
}

fn contact(plan: &Plan, b: &Block, s: usize, lane: usize) -> Option<Contact> {
    let slot = &plan.contacts[s];
    let dist = b.con_dist[s].0[lane];

    if b.con_found[s].0[lane] <= 0.0 || dist >= slot.include_margin {
        return None;
    }

    let pair = &plan.kernel.pairs[slot.pair];
    let body = plan.kernel.geoms[pair.geoms[1]].body;
    let frame: [f64; 9] = at(&b.con_frame, s, lane);
    let pos: [f64; 3] = at(&b.con_pos, s, lane);
    let xpos: [f64; 3] = at(&b.xpos, body, lane);
    let xmat: [f64; 9] = at(&b.xmat, body, lane);
    let plane: [f64; 3] = at(&b.geom_xpos, pair.geoms[0], lane);
    let surface: [f64; 3] = std::array::from_fn(|a| pos[a] + 0.5 * dist * frame[a] - xpos[a]);
    let local = std::array::from_fn(|c| (0..3).map(|r| xmat[3 * r + c] * surface[r]).sum());

    Some(Contact {
        slot: s,
        body,
        local,
        frame,
        offset: (0..3).map(|a| frame[a] * plane[a]).sum(),
        slide: slide(plan, b, slot.pair, lane),
    })
}

pub fn freeze(plan: &Plan, b: &Block, lane: usize) -> Frozen {
    Frozen {
        contacts: (0..plan.contacts.len())
            .filter_map(|s| contact(plan, b, s, lane))
            .collect(),
        qacc: b.qacc.iter().map(|v| v.0[lane]).collect(),
    }
}
