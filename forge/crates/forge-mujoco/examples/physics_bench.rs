use forge_mujoco::{Batch, Data, Model};
use std::path::Path;
use std::time::Instant;

fn main() {
    let path = std::env::args().nth(1).expect("model path");
    let model = Model::load(Path::new(&path)).expect("load");
    let decim = 10;
    let steps = 300;
    let nsim = 64;
    println!(
        "nq {} nv {} nu {} ngeom {} version {}",
        model.nq(),
        model.nv(),
        model.nu(),
        model.ngeom(),
        forge_mujoco::version()
    );

    let mut single = Data::new(&model);
    single.forward(&model);
    let t = Instant::now();
    for _ in 0..3000 {
        single.step(&model);
    }
    println!(
        "single thread mj_step: {:.1} us",
        t.elapsed().as_secs_f64() / 3000.0 * 1e6
    );

    for &threads in &[1usize, 4, 6, 8, 10, 12, 14, 16, 18] {
        let mut batch = Batch::new(&model, nsim, threads).expect("batch");
        let layout = batch.layout();
        batch.state().fill(0.0);
        let mut seed = Data::new(&model);
        seed.forward(&model);
        let mut row = vec![0.0; layout.nstate];
        seed.get_state(&model, &mut row, forge_mujoco::integration_state());
        for sim in 0..nsim {
            batch.row(sim).copy_from_slice(&row);
        }
        let n = batch.expand("geom_friction").map(|(_, w)| w).unwrap_or(0);
        let t = Instant::now();
        for _ in 0..steps {
            batch.step(decim);
        }
        let dt = t.elapsed().as_secs_f64();
        let per_control = dt / steps as f64;
        println!(
            "threads {threads:2} nthread {:2} expand width {n}: {:.3} ms per control step, {:.0} control-steps/s, {:.1} us per mj_step (thread-time)",
            batch.nthread(),
            per_control * 1e3,
            (steps * nsim) as f64 / dt,
            dt * threads as f64 / (steps * nsim * decim) as f64 * 1e6,
        );
    }
}
