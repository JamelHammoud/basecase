use crate::eyes::{ray_value, EyeSpec, RAY_GROUPS};
use crate::physics::Physics;
use crate::robot::Robot;
use forge_mujoco::{Data, Model, Rays};
use rayon::prelude::*;

struct Eye {
    body: usize,
    pos: [f64; 3],
    dirs: Vec<f64>,
    slots: Vec<usize>,
    rays: usize,
    range_m: f64,
}

struct Worker {
    data: Data,
    dirs: Vec<f64>,
    dist: Vec<f64>,
}

pub struct EyeRays {
    eyes: Vec<Eye>,
    width: usize,
    nq: usize,
    qpos_at: usize,
    qpos: Vec<f64>,
    values: Vec<f32>,
    workers: Vec<Worker>,
}

fn compact(spec: &EyeSpec, body: usize) -> Eye {
    let cast: Vec<usize> = spec
        .dirs
        .as_chunks::<3>()
        .0
        .iter()
        .enumerate()
        .filter(|(_, d)| d.iter().any(|v| *v != 0.0))
        .map(|(slot, _)| slot)
        .collect();

    Eye {
        body,
        pos: spec.pos,
        dirs: cast
            .iter()
            .flat_map(|&s| spec.dirs[3 * s..3 * s + 3].to_vec())
            .collect(),
        slots: cast,
        rays: spec.rays(),
        range_m: spec.range_m,
    }
}

fn cast(eye: &Eye, model: &Model, worker: &mut Worker, out: &mut [f32]) {
    let Worker { data, dirs, dist } = worker;
    let frame = data.body_frame(model, eye.body);

    dirs.clear();
    eye.dirs
        .as_chunks::<3>()
        .0
        .iter()
        .for_each(|d| dirs.extend(frame.direction(*d)));
    dist.resize(eye.slots.len(), 0.0);

    let rays = Rays {
        origin: frame.point(eye.pos),
        dirs: dirs.as_slice(),
        groups: RAY_GROUPS,
        static_geoms: true,
        exclude_body: Some(eye.body),
        cutoff: eye.range_m,
    };

    data.multi_ray(model, &rays, dist);
    out.fill(1.0);

    for (slot, d) in eye.slots.iter().zip(dist.iter()) {
        out[*slot] = ray_value(*d, eye.range_m);
    }
}

fn see(eyes: &[Eye], model: &Model, worker: &mut Worker, qpos: &[f64], out: &mut [f32]) {
    worker.data.qpos().copy_from_slice(qpos);
    worker.data.kinematics(model);

    let mut at = 0;

    for eye in eyes {
        cast(eye, model, worker, &mut out[at..at + eye.rays]);
        at += eye.rays;
    }
}

impl EyeRays {
    pub fn new(robot: &Robot, count: usize, threads: usize) -> Self {
        let model = &robot.model;
        let eyes: Vec<Eye> = robot
            .job
            .eyes
            .iter()
            .zip(&robot.eye_bodies)
            .map(|(spec, &body)| compact(spec, body))
            .collect();
        let width = robot.eye_width();
        let nq = model.nq();
        let workers = if eyes.is_empty() {
            0
        } else {
            threads.clamp(1, count.max(1))
        };

        Self {
            eyes,
            width,
            nq,
            qpos_at: robot.layout.qpos,
            qpos: vec![0.0; if width == 0 { 0 } else { count * nq }],
            values: vec![0.0; count * width],
            workers: (0..workers)
                .map(|_| Worker {
                    data: Data::new(model),
                    dirs: Vec::new(),
                    dist: Vec::new(),
                })
                .collect(),
        }
    }

    fn hold(&mut self, batch: &mut Physics, sim: usize) {
        let (nq, at) = (self.nq, self.qpos_at);

        self.qpos[sim * nq..(sim + 1) * nq].copy_from_slice(&batch.row(sim)[at..at + nq]);
    }

    pub fn see_all(&mut self, model: &Model, batch: &mut Physics) {
        if self.width == 0 {
            return;
        }

        let count = self.values.len() / self.width;

        (0..count).for_each(|sim| self.hold(batch, sim));

        let (eyes, width, nq) = (&self.eyes, self.width, self.nq);
        let per = count.div_ceil(self.workers.len());

        self.workers
            .par_iter_mut()
            .zip(self.values.par_chunks_mut(per * width))
            .zip(self.qpos.par_chunks(per * nq))
            .for_each(|((worker, out), qpos)| {
                for (o, q) in out.chunks_exact_mut(width).zip(qpos.chunks_exact(nq)) {
                    see(eyes, model, worker, q, o);
                }
            });
    }

    pub fn see_one(&mut self, model: &Model, batch: &mut Physics, sim: usize) {
        if self.width == 0 {
            return;
        }

        self.hold(batch, sim);

        let (nq, width) = (self.nq, self.width);

        see(
            &self.eyes,
            model,
            &mut self.workers[0],
            &self.qpos[sim * nq..(sim + 1) * nq],
            &mut self.values[sim * width..(sim + 1) * width],
        );
    }

    pub fn values(&self, sim: usize) -> &[f32] {
        &self.values[sim * self.width..(sim + 1) * self.width]
    }
}
