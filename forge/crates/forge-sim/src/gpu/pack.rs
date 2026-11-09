use super::layout::Layout;
use super::sink::split;
use crate::plan::Plan;
use crate::rowmap::RowMap;
use crate::tables::WorldTables;

pub struct Slots {
    qpos: usize,
    qvel: usize,
    ctrl: usize,
    warm: usize,
    time: usize,
    hist: usize,
    tables: [usize; 5],
}

impl Slots {
    pub fn new(l: &Layout) -> Self {
        let at = |n: &str| l.at(n).0;

        Self {
            qpos: at("QPOS"),
            qvel: at("QVEL"),
            ctrl: at("CTRL"),
            warm: at("WARM"),
            time: at("TIME"),
            hist: at("HIST"),
            tables: [at("TMASS"), at("TFRIC"), at("TGAIN"), at("TBIAS"), at("TGEAR")],
        }
    }
}

fn put(out: &mut [f32], at: usize, values: &[f64]) {
    for (k, v) in values.iter().enumerate() {
        let (hi, lo) = split(*v);

        out[2 * (at + k)] = hi;
        out[2 * (at + k) + 1] = lo;
    }
}

fn get(block: &[f32], at: usize, out: &mut [f64]) {
    for (k, v) in out.iter_mut().enumerate() {
        *v = f64::from(block[2 * (at + k)]) + f64::from(block[2 * (at + k) + 1]);
    }
}

pub struct Pack<'a> {
    pub map: &'a RowMap,
    pub slots: &'a Slots,
    pub nq: usize,
    pub nv: usize,
    pub nu: usize,
}

impl<'a> Pack<'a> {
    pub fn new(map: &'a RowMap, slots: &'a Slots, plan: &Plan) -> Self {
        let k = &plan.kernel;

        Self {
            map,
            slots,
            nq: k.nq,
            nv: k.nv,
            nu: k.nu,
        }
    }

    pub fn load(&self, row: &[f64], tables: &WorldTables, out: &mut [f32]) {
        let (m, s) = (self.map, self.slots);

        put(out, s.qpos, &row[m.qpos..m.qpos + self.nq]);
        put(out, s.qvel, &row[m.qvel..m.qvel + self.nv]);
        put(out, s.ctrl, &row[m.ctrl..m.ctrl + self.nu]);
        put(out, s.warm, &row[m.warm..m.warm + self.nv]);
        put(out, s.time, &row[m.time..=m.time]);

        let mut at = s.hist;

        for buf in &m.buffers {
            let base = m.history + buf.adr;
            let n = buf.samples;

            put(out, at, &row[base + 2..base + 2 + 2 * n]);
            put(out, at + 2 * n, &row[base + 1..base + 2]);
            at += 2 * n + 1;
        }

        put(out, s.tables[0], tables.mass);
        put(out, s.tables[1], tables.friction);
        put(out, s.tables[2], tables.gain);

        let bias: Vec<f64> = tables.bias.iter().flatten().copied().collect();

        put(out, s.tables[3], &bias);
        put(out, s.tables[4], tables.gear);
    }

    pub fn store(&self, block: &[f32], row: &mut [f64]) -> bool {
        let (m, s) = (self.map, self.slots);

        get(block, s.qpos, &mut row[m.qpos..m.qpos + self.nq]);
        get(block, s.qvel, &mut row[m.qvel..m.qvel + self.nv]);
        get(block, s.warm, &mut row[m.warm..m.warm + self.nv]);
        get(block, s.time, &mut row[m.time..=m.time]);

        let mut at = s.hist;

        for buf in &m.buffers {
            let base = m.history + buf.adr;
            let n = buf.samples;

            get(block, at, &mut row[base + 2..base + 2 + 2 * n]);
            get(block, at + 2 * n, &mut row[base + 1..base + 2]);
            at += 2 * n + 1;
        }

        m.finite(row, self.nq, self.nv)
    }
}

pub fn group_order(contacts: &[f64], work: &[f64], order: &mut [u32]) {
    let keys: Vec<f64> = contacts.iter().zip(work).map(|(c, w)| c * 1000.0 + w).collect();
    let mut sorted: Vec<usize> = (0..keys.len()).collect();

    sorted.sort_by(|a, b| keys[*b].total_cmp(&keys[*a]));

    for (slot, sim) in order.iter_mut().zip(sorted) {
        *slot = sim as u32;
    }
}
