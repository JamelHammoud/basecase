use crate::state::State;
use forge_mujoco::Model;

const TIME: i32 = 1 << 0;
const QPOS: i32 = 1 << 1;
const QVEL: i32 = 1 << 2;
const HISTORY: i32 = 1 << 4;
const WARMSTART: i32 = 1 << 5;
const CTRL: i32 = 1 << 6;

#[derive(Clone, Debug)]
pub struct Buffer {
    pub adr: usize,
    pub samples: usize,
}

#[derive(Clone, Debug)]
pub struct RowMap {
    pub nstate: usize,
    pub time: usize,
    pub qpos: usize,
    pub qvel: usize,
    pub history: usize,
    pub warm: usize,
    pub ctrl: usize,
    pub buffers: Vec<Buffer>,
}

fn offset(model: &Model, signature: i32, component: i32) -> usize {
    model.state_size(signature & (component - 1))
}

impl RowMap {
    pub fn new(model: &Model) -> Result<Self, String> {
        let sig = forge_mujoco::integration_state();
        let adr = model
            .array("actuator_historyadr")
            .and_then(|a| a.i32s())
            .ok_or("This MuJoCo build has no actuator_historyadr")?;
        let samples = model
            .array("actuator_history")
            .and_then(|a| a.i32s())
            .ok_or("This MuJoCo build has no actuator_history")?;
        let buffers = (0..model.nu())
            .filter(|&a| samples[2 * a] > 0)
            .map(|a| Buffer {
                adr: adr[a] as usize,
                samples: samples[2 * a] as usize,
            })
            .collect();

        Ok(Self {
            nstate: model.state_size(sig),
            time: offset(model, sig, TIME),
            qpos: offset(model, sig, QPOS),
            qvel: offset(model, sig, QVEL),
            history: offset(model, sig, HISTORY),
            warm: offset(model, sig, WARMSTART),
            ctrl: offset(model, sig, CTRL),
            buffers,
        })
    }

    pub fn load(&self, state: &mut State, lane: usize, row: &[f64]) {
        let fields = [
            (&mut state.qpos, self.qpos),
            (&mut state.qvel, self.qvel),
            (&mut state.warm, self.warm),
            (&mut state.ctrl, self.ctrl),
        ];

        for (values, at) in fields {
            for (k, v) in values.iter_mut().enumerate() {
                v.0[lane] = row[at + k];
            }
        }

        state.time.0[lane] = row[self.time];

        for (h, buf) in state.history.iter_mut().zip(&self.buffers) {
            let base = self.history + buf.adr;
            let n = buf.samples;

            h.cursor[lane] = row[base + 1] as usize;
            h.times[lane].copy_from_slice(&row[base + 2..base + 2 + n]);
            h.values[lane].copy_from_slice(&row[base + 2 + n..base + 2 + 2 * n]);
        }
    }

    pub fn store(&self, state: &State, lane: usize, row: &mut [f64]) {
        let fields = [
            (&state.qpos, self.qpos),
            (&state.qvel, self.qvel),
            (&state.warm, self.warm),
            (&state.ctrl, self.ctrl),
        ];

        for (values, at) in fields {
            for (k, v) in values.iter().enumerate() {
                row[at + k] = v.0[lane];
            }
        }

        row[self.time] = state.time.0[lane];

        for (h, buf) in state.history.iter().zip(&self.buffers) {
            let base = self.history + buf.adr;
            let n = buf.samples;

            row[base + 1] = h.cursor[lane] as f64;
            row[base + 2..base + 2 + n].copy_from_slice(&h.times[lane]);
            row[base + 2 + n..base + 2 + 2 * n].copy_from_slice(&h.values[lane]);
        }
    }

    pub fn finite(&self, row: &[f64], nq: usize, nv: usize) -> bool {
        row[self.qpos..self.qpos + nq]
            .iter()
            .chain(&row[self.qvel..self.qvel + nv])
            .all(|v| v.is_finite())
    }
}
